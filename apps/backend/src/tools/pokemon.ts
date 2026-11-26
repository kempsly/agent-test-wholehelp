// Read-only tools about one Pokemon: its sheet and its evolution chain. Data comes from PokeAPI only.

import { z } from "zod";
import { defineTool } from "./types";
import { PokeApiError, fetchPokeApi } from "./pokeapi";

/** English name or Pokedex number. Numbers sent as JSON numbers are accepted and turned into strings. */
const nameOrId = z
  .preprocess((value) => (typeof value === "number" ? String(value) : value), z.string().min(1))
  .describe("English Pokemon name (e.g. charizard) or Pokedex number (e.g. 25). Translate French names to English.");

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
        `Pokemon "${name}" not found. Check the spelling, or give the English name or the Pokedex number. ` +
          "If this Pokemon has several forms (deoxys, giratina...), try a specific form such as deoxys-normal.",
      );
    }
    throw error;
  }
}

// ---------- tools ----------

export const getPokemon = defineTool({
  name: "get_pokemon",
  description:
    "Returns the sheet of one Pokemon: id, English and French names, types, base stats, abilities, height, weight and French description. " +
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

    return {
      id: pokemon.id,
      name: pokemon.name,
      french_name: species.names.find((n) => n.language.name === "fr")?.name ?? null,
      types: [...pokemon.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
      base_stats: baseStats,
      abilities: pokemon.abilities.map((a) => a.ability.name),
      height_m: pokemon.height / 10,
      weight_kg: pokemon.weight / 10,
      description_fr: frenchDescription(species.flavor_text_entries),
    };
  },
});

export interface EvolutionStage {
  stage: number;
  pokemon: { name: string; evolves_from: string | null; min_level: number | null; trigger: string | null; item: string | null }[];
}

/** Flattens the evolution tree into ordered stages; branches (Eevee) are several Pokemon in the same stage. */
export function flattenEvolutionChain(root: ChainLink): EvolutionStage[] {
  const stages: EvolutionStage[] = [];
  const visit = (link: ChainLink, depth: number, parent: string | null) => {
    const details = link.evolution_details[0];
    const stage = (stages[depth] ??= { stage: depth + 1, pokemon: [] });
    stage.pokemon.push({
      name: link.species.name,
      evolves_from: parent,
      min_level: details?.min_level ?? null,
      trigger: details?.trigger?.name ?? null,
      item: details?.item?.name ?? null,
    });
    for (const next of link.evolves_to) visit(next, depth + 1, link.species.name);
  };
  visit(root, 0, null);
  return stages;
}

export const getEvolutionChain = defineTool({
  name: "get_evolution_chain",
  description:
    "Returns the evolution chain of a Pokemon as ordered stages (with branches, e.g. Eevee), with the minimum level, trigger or item when present. " +
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
