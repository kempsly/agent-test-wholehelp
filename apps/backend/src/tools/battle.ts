// Battle tool (bonus): reads the two Pokemon from PokeAPI, then the deterministic engine does all the calculation.
// Read-only: nothing is stored, the whole fight is simulated in one call.

import { z } from "zod";
import { defineTool } from "./types";
import { citesPokemon, frenchNameOf } from "./frenchNames";
import { fetchPokemonBattleData, nameOrId } from "./pokemon";
import { fetchDefenderRelations } from "./typeMatchups";
import { simulateBattle, type Fighter } from "../battle/engine";

/** The fighter, named by its French name (Ronflex) so that the log, the winner and the battle view are in French. */
async function loadFighter(nameOrIdValue: string): Promise<Fighter & { english: string }> {
  const pokemon = await fetchPokemonBattleData(nameOrIdValue);
  return {
    english: pokemon.name,
    name: frenchNameOf(pokemon.name) ?? pokemon.name,
    types: pokemon.types,
    defenderRelations: await Promise.all(pokemon.types.map(fetchDefenderRelations)),
    hp: pokemon.stats.hp,
    attack: pokemon.stats.attack,
    defense: pokemon.stats.defense,
    speed: pokemon.stats.speed,
  };
}

/**
 * A Pokedex number the user did not write, while the question names Pokemon: the model translated a name into a
 * number from memory (Ronflex -> 10 gave caterpie). Refused, so that the model passes the names.
 */
function guessedNumber(value: string, question: string): boolean {
  return /^\d+$/.test(value) && citesPokemon(question) && !new RegExp(`(?<!\\d)${value}(?!\\d)`).test(question);
}

/** The battle tool. With the question of the turn (answer.ts), a number is refused when the user gave a name. */
export function makeSimulateBattleTool(question = "") {
  return defineTool({
    name: "simulate_battle",
    description:
      "Simulates a turn-by-turn battle between two Pokemon and returns the winner and the battle log (attack type, effectiveness, damage, remaining HP). " +
      "The result is calculated by code from their PokeAPI stats and types. Use it for any question about who wins a fight or a battle between two Pokemon; never guess a winner. " +
      "Pass the names exactly as the user wrote them; a Pokedex number only if the user gave that number.",
    schema: z.object({
      pokemon_a: nameOrId.describe("First Pokemon: name as the user wrote it (French or English), or Pokedex number only if the user wrote it. It attacks first when speeds are equal."),
      pokemon_b: nameOrId.describe("Second Pokemon: name as the user wrote it (French or English), or Pokedex number only if the user wrote it."),
    }),
    execute: async ({ pokemon_a, pokemon_b }) => {
      for (const value of [pokemon_a, pokemon_b]) {
        if (guessedNumber(value, question)) {
          throw new Error(`The user named the Pokemon: pass their names exactly as written in the question, not a Pokedex number ("${value}" is not in the question).`);
        }
      }
      const [a, b] = await Promise.all([loadFighter(pokemon_a), loadFighter(pokemon_b)]);
      return {
        pokemon_a: a.english,
        pokemon_b: b.english,
        pokemon_a_fr: a.name,
        pokemon_b_fr: b.name,
        ...simulateBattle(a, b),
        simplification:
          "Simplified simulation: no moves, each Pokemon attacks with its best own type, damage uses attack, defense and type effectiveness only.",
      };
    },
  });
}

export const simulateBattleTool = makeSimulateBattleTool();
