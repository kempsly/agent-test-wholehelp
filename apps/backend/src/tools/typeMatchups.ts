// Type matchups: the final multiplier against 1 or 2 defending types is computed here, in code, never by the model.

import { z } from "zod";
import { defineTool } from "./types";
import { PokeApiError, fetchPokeApi } from "./pokeapi";

/** Closed list of the 18 types. */
export const POKEMON_TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
] as const;

export type PokemonType = (typeof POKEMON_TYPES)[number];

/** How the attacking types hit one defending type (names of attacking types). */
export interface DefenderRelations {
  double_damage_from: string[];
  half_damage_from: string[];
  no_damage_from: string[];
}

const typeResponse = z.object({
  damage_relations: z.object({
    double_damage_from: z.array(z.object({ name: z.string() })),
    half_damage_from: z.array(z.object({ name: z.string() })),
    no_damage_from: z.array(z.object({ name: z.string() })),
  }),
});

/** Final multiplier of each of the 18 attacking types against a defender with 1 or 2 types. */
export function computeMultipliers(defenders: DefenderRelations[]): Record<PokemonType, number> {
  const result = {} as Record<PokemonType, number>;
  for (const attacker of POKEMON_TYPES) {
    let multiplier = 1;
    for (const d of defenders) {
      if (d.no_damage_from.includes(attacker)) multiplier *= 0;
      else if (d.double_damage_from.includes(attacker)) multiplier *= 2;
      else if (d.half_damage_from.includes(attacker)) multiplier *= 0.5;
    }
    result[attacker] = multiplier;
  }
  return result;
}

const GROUPS: [key: string, multiplier: number][] = [
  ["x4", 4],
  ["x2", 2],
  ["x1", 1],
  ["x0_5", 0.5],
  ["x0_25", 0.25],
  ["x0", 0],
];

export const getTypeMatchups = defineTool({
  name: "get_type_matchups",
  description:
    "Returns, for a defending Pokemon with 1 or 2 types, the final damage multiplier of each of the 18 attacking types (x4, x2, x1, x0.5, x0.25, x0), already combined for dual types. " +
    "Use it for any question about weaknesses, resistances, immunities or type effectiveness. Pass the types of the defending Pokemon (get its types with get_pokemon if unknown).",
  schema: z.object({
    types: z
      .array(z.enum(POKEMON_TYPES))
      .min(1)
      .max(2)
      .refine((types) => new Set(types).size === types.length, "types must be different")
      .describe("The 1 or 2 types of the DEFENDING Pokemon, in English lowercase (e.g. [\"fire\", \"flying\"])"),
  }),
  execute: async ({ types }) => {
    const relations: DefenderRelations[] = [];
    for (const type of types) {
      const parsed = typeResponse.safeParse(await fetchPokeApi("type", type));
      if (!parsed.success) throw new PokeApiError("unavailable", "PokeAPI unavailable (unexpected type format).");
      const r = parsed.data.damage_relations;
      relations.push({
        double_damage_from: r.double_damage_from.map((t) => t.name),
        half_damage_from: r.half_damage_from.map((t) => t.name),
        no_damage_from: r.no_damage_from.map((t) => t.name),
      });
    }

    const multipliers = computeMultipliers(relations);
    const groups: Record<string, string[]> = {};
    for (const [key, value] of GROUPS) {
      groups[key] = POKEMON_TYPES.filter((attacker) => multipliers[attacker] === value);
    }
    return { defender_types: types, attacking_types_by_multiplier: groups };
  },
});
