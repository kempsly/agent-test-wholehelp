// Type matchups: the final multiplier against 1 or 2 defending types is computed here, in code, never by the model.

import { z } from "zod";
import { defineTool } from "./types";
import { PokeApiError, fetchPokeApi } from "./pokeapi";
import { frenchNameOf } from "./frenchNames";
import { fetchPokemonTypes, nameOrId } from "./pokemon";
import { POKEMON_TYPES, TYPE_FR, type PokemonType } from "./pokemonTypes";

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

const entry = (type: PokemonType, multiplicateur: number) => ({ type_fr: TYPE_FR[type], type_en: type, multiplicateur });
type Entry = ReturnType<typeof entry>;

/** "x4", "x0,25": French decimal comma. */
const formatMultiplier = (m: number) => `x${String(m).replace(".", ",")}`;
const line = (label: string, entries: Entry[]) =>
  `${label} : ${entries.length ? entries.map((e) => `${e.type_fr} (${formatMultiplier(e.multiplicateur)})`).join(", ") : "aucune"}`;

/** The lists as the user reads them, written in code from the multipliers (added to the answer as it is). */
export function matchupSummaryFr(lists: { faiblesses: Entry[]; resistances: Entry[]; immunites: Entry[] }): string {
  return [
    line("Faiblesses", lists.faiblesses),
    line("Résistances", lists.resistances),
    line("Immunités", lists.immunites),
    "Les autres types infligent des dégâts normaux (x1).",
  ].join("\n");
}

/** How one defending type is hit, from PokeAPI (shared with the battle tool). */
export async function fetchDefenderRelations(type: PokemonType): Promise<DefenderRelations> {
  const parsed = typeResponse.safeParse(await fetchPokeApi("type", type));
  if (!parsed.success) throw new PokeApiError("unavailable", "PokeAPI unavailable (unexpected type format).");
  const r = parsed.data.damage_relations;
  return {
    double_damage_from: r.double_damage_from.map((t) => t.name),
    half_damage_from: r.half_damage_from.map((t) => t.name),
    no_damage_from: r.no_damage_from.map((t) => t.name),
  };
}

export const getTypeMatchups = defineTool({
  name: "get_type_matchups",
  description:
    "Returns, for a defending Pokemon with 1 or 2 types, its weaknesses (faiblesses), resistances and immunities: each attacking type with its French and English names and its final damage multiplier (x4, x2, x0.5, x0.25, x0), already combined for dual types. Attacking types not listed deal normal damage (x1). " +
    "Use it for any question about weaknesses, resistances, immunities or type effectiveness. " +
    "To ask about a Pokemon, pass its name or number in pokemon (its types are read for you); to ask about one or two types without a Pokemon, pass types. Pass exactly one of the two.",
  schema: z
    .object({
      pokemon: nameOrId.optional().describe("The DEFENDING Pokemon: name as the user wrote it (French or English) or Pokedex number. Its types are read automatically."),
      types: z
        .array(z.enum(POKEMON_TYPES))
        .min(1)
        .max(2)
        .refine((types) => new Set(types).size === types.length, "types must be different")
        .optional()
        .describe("Instead of pokemon: the 1 or 2 types of the DEFENDING side, in English lowercase"),
    })
    .refine((args) => (args.pokemon === undefined) !== (args.types === undefined), "Give exactly one of pokemon or types"),
  execute: async ({ pokemon, types }) => {
    const defender = pokemon !== undefined ? await fetchPokemonTypes(pokemon) : { name: undefined, types: types! };

    const relations = await Promise.all(defender.types.map(fetchDefenderRelations));

    const multipliers = computeMultipliers(relations);
    const attackers = POKEMON_TYPES.map((type) => ({ type, multiplier: multipliers[type] }));
    const lists = {
      faiblesses: attackers.filter((a) => a.multiplier > 1).sort((a, b) => b.multiplier - a.multiplier).map((a) => entry(a.type, a.multiplier)),
      resistances: attackers.filter((a) => a.multiplier > 0 && a.multiplier < 1).sort((a, b) => a.multiplier - b.multiplier).map((a) => entry(a.type, a.multiplier)),
      immunites: attackers.filter((a) => a.multiplier === 0).map((a) => entry(a.type, 0)),
    };
    return {
      ...(defender.name && { pokemon: defender.name, pokemon_fr: frenchNameOf(defender.name) ?? defender.name }),
      defender_types: defender.types,
      defender_types_fr: defender.types.map((t) => TYPE_FR[t]),
      ...lists,
      summary_fr: matchupSummaryFr(lists),
    };
  },
});
