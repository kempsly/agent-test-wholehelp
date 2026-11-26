// Battle tool (bonus): reads the two Pokemon from PokeAPI, then the deterministic engine does all the calculation.
// Read-only: nothing is stored, the whole fight is simulated in one call.

import { z } from "zod";
import { defineTool } from "./types";
import { fetchPokemonBattleData, nameOrId } from "./pokemon";
import { fetchDefenderRelations } from "./typeMatchups";
import { simulateBattle, type Fighter } from "../battle/engine";

async function loadFighter(nameOrIdValue: string): Promise<Fighter> {
  const pokemon = await fetchPokemonBattleData(nameOrIdValue);
  return {
    name: pokemon.name,
    types: pokemon.types,
    defenderRelations: await Promise.all(pokemon.types.map(fetchDefenderRelations)),
    hp: pokemon.stats.hp,
    attack: pokemon.stats.attack,
    defense: pokemon.stats.defense,
    speed: pokemon.stats.speed,
  };
}

export const simulateBattleTool = defineTool({
  name: "simulate_battle",
  description:
    "Simulates a turn-by-turn battle between two Pokemon and returns the winner and the battle log (attack type, effectiveness, damage, remaining HP). " +
    "The result is calculated by code from their PokeAPI stats and types. Use it for any question about who wins a fight or a battle between two Pokemon; never guess a winner.",
  schema: z.object({
    pokemon_a: nameOrId.describe("First Pokemon: name as the user wrote it (French or English) or Pokedex number. It attacks first when speeds are equal."),
    pokemon_b: nameOrId.describe("Second Pokemon: name as the user wrote it (French or English) or Pokedex number."),
  }),
  execute: async ({ pokemon_a, pokemon_b }) => {
    const [a, b] = await Promise.all([loadFighter(pokemon_a), loadFighter(pokemon_b)]);
    return {
      pokemon_a: a.name,
      pokemon_b: b.name,
      ...simulateBattle(a, b),
      simplification:
        "Simplified simulation: no moves, each Pokemon attacks with its best own type, damage uses attack, defense and type effectiveness only.",
    };
  },
});
