// Read-only tools about one Pokemon: its sheet and its evolution chain. Data comes from PokeAPI only.

import { z } from "zod";
import { defineTool } from "./types";
import { resolvePokemonName } from "./frenchNames";
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

interface ChainLink {
  species: { name: string };
  evolution_details: { min_level: number | null; trigger: { name: string } | null; item: { name: string } | null }[];
  evolves_to: ChainLink[];
}

const chainLink: z.ZodType<ChainLink> = z.lazy(() =>
  z.object({
    species: namedResource,
    evolution_details: z.array(
      z.object({
        min_level: z.number().nullable().optional().transform((v) => v ?? null),
        trigger: namedResource.nullable().optional().transform((v) => v ?? null),
        item: namedResource.nullable().optional().transform((v) => v ?? null),
      }),
    ),
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
    "Returns the sheet of one Pokemon: id, English and French names, types (English in types, French in types_fr), base stats, abilities, height, weight and French description. " +
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
      abilities: pokemon.abilities.map((a) => a.ability.name),
      height_m: pokemon.height / 10,
      weight_kg: pokemon.weight / 10,
      description_fr: frenchDescription(species.flavor_text_entries),
    };
  },
});

/** Only the fields present in PokeAPI are given: an absent field is never replaced by a guess. */
export interface EvolutionStage {
  stage: number;
  pokemon: { name: string; evolves_from?: string; min_level?: number; trigger?: string; item?: string }[];
}

/** Flattens the evolution tree into ordered stages; branches (Eevee) are several Pokemon in the same stage. */
export function flattenEvolutionChain(root: ChainLink): EvolutionStage[] {
  const stages: EvolutionStage[] = [];
  const visit = (link: ChainLink, depth: number, parent: string | null) => {
    const details = link.evolution_details[0];
    const stage = (stages[depth] ??= { stage: depth + 1, pokemon: [] });
    stage.pokemon.push({
      name: link.species.name,
      ...(parent && { evolves_from: parent }),
      ...(details?.min_level != null && { min_level: details.min_level }),
      ...(details?.trigger && { trigger: details.trigger.name }),
      ...(details?.item && { item: details.item.name }),
    });
    for (const next of link.evolves_to) visit(next, depth + 1, link.species.name);
  };
  visit(root, 0, null);
  return stages;
}

export const getEvolutionChain = defineTool({
  name: "get_evolution_chain",
  description:
    "Returns the evolution chain of a Pokemon as ordered stages (with branches, e.g. Eevee), with the minimum level, trigger or item only when PokeAPI provides them (an absent field means the condition is not specified). " +
    "Use it for any question about evolutions, pre-evolutions or what a Pokemon evolves into.",
  schema: z.object({ name_or_id: nameOrId }),
  execute: async ({ name_or_id }) => {
    const pokemon = await fetchPokemon(name_or_id);
    const species = parseApi(speciesResponse, await fetchPokeApi("pokemon-species", pokemon.species.name), "species");

    // The id comes from PokeAPI, not from the model: it still goes through the fixed base URL and the validation.
    const chainId = species.evolution_chain.url.match(/\/evolution-chain\/(\d+)\/?$/)?.[1];
    if (!chainId) throw new PokeApiError("unavailable", "PokeAPI unavailable (unexpected evolution chain URL).");

    const { chain } = parseApi(evolutionChainResponse, await fetchPokeApi("evolution-chain", chainId), "evolution chain");
    return { pokemon: pokemon.name, stages: flattenEvolutionChain(chain) };
  },
});
