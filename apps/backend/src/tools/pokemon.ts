// Read-only tools about one Pokemon: its sheet and its evolution chain. Data comes from PokeAPI only.

import { z } from "zod";
import { defineTool } from "./types";
import { frenchNameOf, resolvePokemonName } from "./frenchNames";
import { conditionFr, fetchFrenchNames, latestConditions } from "./evolutionText";
import { PokeApiError, fetchPokeApi } from "./pokeapi";
import { POKEMON_TYPES, typeFr, type PokemonType } from "./pokemonTypes";

/**
 * French or English name, or Pokedex number. A known French name is replaced by the English name from the table
 * (data/names-fr.json); anything else is kept as is. Numbers sent as JSON numbers are turned into strings.
 */
export const nameOrId = z
  .preprocess(
    (value) => (typeof value === "number" ? String(value) : typeof value === "string" ? resolvePokemonName(value) : value),
    z.string().min(1),
  )
  .describe("Pokemon name exactly as the user wrote it, French or English (e.g. Dracaufeu, charizard), or Pokedex number (e.g. 25). Never translate it.");

// ---------- shapes of the PokeAPI answers we rely on (anything else is ignored) ----------

const namedResource = z.object({ name: z.string() });

const pokemonResponse = z.object({
  id: z.number(),
  name: z.string(),
  height: z.number(),
  weight: z.number(),
  types: z.array(z.object({ slot: z.number(), type: namedResource })),
  stats: z.array(z.object({ base_stat: z.number(), stat: namedResource })),
  abilities: z.array(z.object({ ability: namedResource })),
  species: namedResource,
});

const speciesResponse = z.object({
  names: z.array(z.object({ name: z.string(), language: namedResource })),
  flavor_text_entries: z.array(z.object({ flavor_text: z.string(), language: namedResource })),
  evolution_chain: z.object({ url: z.string() }),
});

/**
 * One evolution condition as PokeAPI gives it (one entry per version group). PokeAPI has about 30 fields
 * (trigger, min_level, gender, held_item, known_move, trade_species...), most of them null: all are read, and only
 * the non-empty ones are returned (see toCondition).
 */
const evolutionDetail = z.record(z.string(), z.unknown());

interface ChainLink {
  species: { name: string };
  evolution_details: z.infer<typeof evolutionDetail>[];
  evolves_to: ChainLink[];
}

const chainLink: z.ZodType<ChainLink> = z.lazy(() =>
  z.object({
    species: namedResource,
    evolution_details: z.array(evolutionDetail),
    evolves_to: z.array(chainLink),
  }),
) as z.ZodType<ChainLink>;

const evolutionChainResponse = z.object({ chain: chainLink });

// ---------- helpers ----------

const DESCRIPTION_MAX_LENGTH = 300;
const STAT_KEYS: Record<string, string> = {
  hp: "hp",
  attack: "attack",
  defense: "defense",
  "special-attack": "special_attack",
  "special-defense": "special_defense",
  speed: "speed",
};

function parseApi<T>(schema: z.ZodType<T>, data: unknown, what: string): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new PokeApiError("unavailable", `PokeAPI unavailable (unexpected ${what} format).`);
  return parsed.data;
}

/** French description only (null if none, no fallback to another language), cleaned and limited to 300 characters. */
function frenchDescription(entries: { flavor_text: string; language: { name: string } }[]): string | null {
  const entry = entries.find((e) => e.language.name === "fr");
  if (!entry) return null;
  const text = entry.flavor_text.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > DESCRIPTION_MAX_LENGTH ? `${text.slice(0, DESCRIPTION_MAX_LENGTH - 1)}…` : text;
}

/** /pokemon/{x}; a 404 here usually means a Pokemon with several forms (deoxys, giratina...). */
async function fetchPokemon(name: string) {
  try {
    return parseApi(pokemonResponse, await fetchPokeApi("pokemon", name), "pokemon");
  } catch (error) {
    if (error instanceof PokeApiError && error.kind === "not_found") {
      throw new PokeApiError(
        "not_found",
        `Pokemon "${name}" not found. Check the spelling, or give the French or English name or the Pokedex number. ` +
          "If this Pokemon has several forms (deoxys, giratina...), try a specific form such as deoxys-normal.",
      );
    }
    throw error;
  }
}

/** Name and types (1 or 2, in slot order) of a Pokemon, read from PokeAPI. */
export async function fetchPokemonTypes(nameOrIdValue: string): Promise<{ name: string; types: PokemonType[] }> {
  const pokemon = await fetchPokemon(nameOrIdValue);
  const names = [...pokemon.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name);
  const parsed = z.array(z.enum(POKEMON_TYPES)).min(1).max(2).safeParse(names);
  if (!parsed.success) throw new PokeApiError("unavailable", "PokeAPI unavailable (unexpected type for this Pokemon).");
  return { name: pokemon.name, types: parsed.data };
}

/** Name, types and base stats of a Pokemon, read from PokeAPI (used by the battle tool). */
export async function fetchPokemonBattleData(nameOrIdValue: string) {
  const pokemon = await fetchPokemon(nameOrIdValue);
  const types = await fetchPokemonTypes(nameOrIdValue);
  const stats: Record<string, number> = {};
  for (const { base_stat, stat } of pokemon.stats) {
    const key = STAT_KEYS[stat.name];
    if (key) stats[key] = base_stat;
  }
  for (const key of ["hp", "attack", "defense", "speed"]) {
    if (stats[key] === undefined) throw new PokeApiError("unavailable", `PokeAPI unavailable (missing stat ${key}).`);
  }
  return { name: pokemon.name, types: types.types, stats: stats as Record<"hp" | "attack" | "defense" | "speed", number> };
}

// ---------- tools ----------

export const getPokemon = defineTool({
  name: "get_pokemon",
  description:
    "Returns the sheet of one Pokemon: id, English and French names, types (English in types, French in types_fr), base stats and their total (base_stat_total), abilities, height, weight and French description. " +
    "Use it for any question about a Pokemon, and once per Pokemon when comparing several. Never answer about a Pokemon without it.",
  schema: z.object({ name_or_id: nameOrId }),
  execute: async ({ name_or_id }) => {
    const pokemon = await fetchPokemon(name_or_id);
    // The species is found from the Pokemon itself, so forms like raichu-alola work too.
    const species = parseApi(speciesResponse, await fetchPokeApi("pokemon-species", pokemon.species.name), "species");

    const baseStats: Record<string, number> = {};
    for (const { base_stat, stat } of pokemon.stats) {
      const key = STAT_KEYS[stat.name];
      if (key) baseStats[key] = base_stat;
    }

    const types = [...pokemon.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name);

    return {
      id: pokemon.id,
      name: pokemon.name,
      french_name: species.names.find((n) => n.language.name === "fr")?.name ?? null,
      types,
      types_fr: types.map(typeFr),
      base_stats: baseStats,
      // Sum of all base stats, computed in code: the model never adds them up.
      base_stat_total: pokemon.stats.reduce((sum, s) => sum + s.base_stat, 0),
      abilities: pokemon.abilities.map((a) => a.ability.name),
      height_m: pokemon.height / 10,
      weight_kg: pokemon.weight / 10,
      description_fr: frenchDescription(species.flavor_text_entries),
    };
  },
});

/**
 * Only the fields present in PokeAPI are given: an absent field is never replaced by a guess.
 * Values: a number (min_level, relative_physical_stats: 0 counts), a name (item, held_item, known_move, trade_species,
 * version_group...), true (needs_overworld_rain, turn_upside_down...) or a list of names (allowed_natures).
 */
export type EvolutionCondition = Record<string, string | number | boolean | string[]>;

export interface EvolutionStage {
  stage: number;
  pokemon: { name: string; name_fr?: string; evolves_from?: string; conditions?: EvolutionCondition[] }[];
}

/** Not a condition: it only says which entry PokeAPI shows by default. */
const IGNORED_FIELDS = new Set(["is_default"]);
/** PokeAPI codes for gender: 1 female, 2 male. */
const GENDERS: Record<number, string> = { 1: "female", 2: "male" };
/** Fields that hold a type: their French name is added (known_move_type_fr). */
const TYPE_FIELDS = new Set(["known_move_type", "party_type"]);

const nameOf = (value: unknown): string | null =>
  value && typeof value === "object" && "name" in value && typeof value.name === "string" ? value.name : null;

function toCondition(detail: z.infer<typeof evolutionDetail>): EvolutionCondition {
  const condition: EvolutionCondition = {};
  for (const [key, value] of Object.entries(detail)) {
    if (IGNORED_FIELDS.has(key) || value === null || value === undefined || value === "" || value === false) continue;
    if (key === "gender" && typeof value === "number") condition.gender = GENDERS[value] ?? value;
    else if (typeof value === "number" || typeof value === "string" || value === true) condition[key] = value;
    else if (Array.isArray(value)) {
      const names = value.map((v) => (typeof v === "string" ? v : nameOf(v))).filter((v): v is string => v !== null);
      if (names.length) condition[key] = names;
    } else {
      const name = nameOf(value);
      if (name === null) continue; // an object without a name: nothing reliable to show
      condition[key] = name;
      if (TYPE_FIELDS.has(key)) condition[`${key}_fr`] = typeFr(name);
    }
  }
  return condition;
}

/**
 * Flattens the evolution tree into ordered stages; branches (Eevee) are several Pokemon in the same stage.
 * Every evolution_details entry is kept as one condition; the French names come from data/names-fr.json.
 */
export function flattenEvolutionChain(root: ChainLink): EvolutionStage[] {
  const stages: EvolutionStage[] = [];
  const visit = (link: ChainLink, depth: number, parent: string | null) => {
    const stage = (stages[depth] ??= { stage: depth + 1, pokemon: [] });
    const nameFr = frenchNameOf(link.species.name);
    const conditions = link.evolution_details.map(toCondition);
    stage.pokemon.push({
      name: link.species.name,
      ...(nameFr && { name_fr: nameFr }),
      ...(parent && { evolves_from: parent }),
      ...(conditions.length > 0 && { conditions }),
    });
    for (const next of link.evolves_to) visit(next, depth + 1, link.species.name);
  };
  visit(root, 0, null);
  return stages;
}

/** One Pokemon of the chain as the tool returns it: condition_fr is the sentence to copy (most recent game). */
export interface EvolutionSummary {
  name: string;
  name_fr?: string;
  evolves_from?: string;
  /** Game of the conditions described by condition_fr (the most recent one in PokeAPI). */
  version_group?: string;
  condition_fr?: string;
  /** Only with all_versions: every PokeAPI entry, all games. */
  conditions?: EvolutionCondition[];
}

/** Keeps only the most recent game for each evolution and adds condition_fr (built in code). */
export async function summarizeEvolutions(stages: EvolutionStage[], allVersions = false) {
  const latest = new Map(stages.flatMap((s) => s.pokemon).map((p) => [p, latestConditions(p.conditions ?? [])] as const));
  const names = await fetchFrenchNames([...latest.values()].flat());
  return stages.map((stage) => ({
    stage: stage.stage,
    pokemon: stage.pokemon.map((p): EvolutionSummary => {
      const { conditions, ...rest } = p;
      if (!conditions) return rest; // first stage: nothing to evolve from
      const kept = latest.get(p)!;
      const version = kept[0]?.version_group;
      return {
        ...rest,
        ...(typeof version === "string" && { version_group: version }),
        condition_fr: conditionFr(kept, names),
        ...(allVersions && { conditions }),
      };
    }),
  }));
}

/** "d'Évoli", "de Salamèche": French elision before a vowel. */
export const fromName = (name: string) => (/^[aeiouyhàâäéèêëîïôöùûü]/i.test(name) ? `d'${name}` : `de ${name}`);

/**
 * The list of the evolutions, written here in code: one line per evolution, its French name, what it evolves from and
 * its own condition_fr. The backend adds this text as it is to the answer, so a condition is never put on another Pokemon.
 */
export function evolutionSummaryFr(stages: { pokemon: EvolutionSummary[] }[]): string {
  const all = stages.flatMap((s) => s.pokemon);
  const displayed = (english: string) => all.find((p) => p.name === english)?.name_fr ?? english;
  const lines = all
    .filter((p) => p.condition_fr !== undefined)
    .map((p) => `${p.name_fr ?? p.name}${p.evolves_from ? ` (évolution ${fromName(displayed(p.evolves_from))})` : ""} : ${p.condition_fr}`);
  const first = all[0];
  if (lines.length === 0) return `${first ? (first.name_fr ?? first.name) : "Ce Pokémon"} n'a pas d'évolution dans PokéAPI.`;
  return lines.join("\n");
}

export const getEvolutionChain = defineTool({
  name: "get_evolution_chain",
  description:
    "Returns the evolution chain of a Pokemon as ordered stages (with branches, e.g. Eevee). Each Pokemon has its English name, its French name (name_fr) and, except the first stage, " +
    "condition_fr: a short French sentence, built from PokeAPI, of how it evolves in the most recent game (version_group). " +
    "summary_fr is the full list of the evolutions with their conditions: it is added to your answer automatically, so only write one short introduction sentence, without any condition. " +
    "Use it for any question about evolutions, pre-evolutions or what a Pokemon evolves into.",
  schema: z.object({
    name_or_id: nameOrId,
    all_versions: z
      .boolean()
      .default(false)
      .describe("Only when the user asks about older games: also return every raw PokeAPI condition of every game."),
  }),
  execute: async ({ name_or_id, all_versions }) => {
    const pokemon = await fetchPokemon(name_or_id);
    const species = parseApi(speciesResponse, await fetchPokeApi("pokemon-species", pokemon.species.name), "species");

    // The id comes from PokeAPI, not from the model: it still goes through the fixed base URL and the validation.
    const chainId = species.evolution_chain.url.match(/\/evolution-chain\/(\d+)\/?$/)?.[1];
    if (!chainId) throw new PokeApiError("unavailable", "PokeAPI unavailable (unexpected evolution chain URL).");

    const { chain } = parseApi(evolutionChainResponse, await fetchPokeApi("evolution-chain", chainId), "evolution chain");
    const stages = await summarizeEvolutions(flattenEvolutionChain(chain), all_versions);
    return { pokemon: pokemon.name, stages, summary_fr: evolutionSummaryFr(stages) };
  },
});
