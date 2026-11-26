// Tests of the battle answer: exactly 2 sentences written in code from the result of simulate_battle.

import { describe, expect, test } from "bun:test";
import type { StreamEvent, ToolTrace } from "@app/shared";
import { z } from "zod";
import { answer } from "./answer";
import { battleAnswer } from "./battleAnswer";
import { simulateBattle, type Fighter } from "./battle/engine";
import { config } from "./config";
import type { ChatFn, OllamaMessage } from "./ollama";
import type { DefenderRelations } from "./tools/typeMatchups";

config.historySecret = "test-secret";

/** How each defending type is hit (PokeAPI damage relations). */
const relations: Record<string, DefenderRelations> = {
  normal: { double_damage_from: ["fighting"], half_damage_from: [], no_damage_from: ["ghost"] },
  ghost: { double_damage_from: ["ghost", "dark"], half_damage_from: ["poison", "bug"], no_damage_from: ["normal", "fighting"] },
  poison: { double_damage_from: ["ground", "psychic"], half_damage_from: ["fighting", "poison", "bug", "grass", "fairy"], no_damage_from: [] },
  electric: { double_damage_from: ["ground"], half_damage_from: ["electric", "flying", "steel"], no_damage_from: [] },
  rock: { double_damage_from: ["water", "grass", "fighting", "ground", "steel"], half_damage_from: ["normal", "fire", "poison", "flying"], no_damage_from: [] },
  ground: { double_damage_from: ["water", "grass", "ice"], half_damage_from: ["poison", "rock"], no_damage_from: ["electric"] },
  water: { double_damage_from: ["electric", "grass"], half_damage_from: ["fire", "water", "ice", "steel"], no_damage_from: [] },
  fire: { double_damage_from: ["water", "ground", "rock"], half_damage_from: ["fire", "grass", "ice", "bug", "steel", "fairy"], no_damage_from: [] },
};

const fighter = (name: string, types: Fighter["types"], hp: number, attack: number, defense: number, speed: number): Fighter => ({
  name, types, defenderRelations: types.map((t) => relations[t]!), hp, attack, defense, speed,
});

/** The trace of simulate_battle, with the real engine (same shape as the tool result). */
function battle(a: Fighter, b: Fighter): ToolTrace {
  return { name: "simulate_battle", arguments: {}, durationMs: 1, result: { pokemon_a: "a", pokemon_b: "b", pokemon_a_fr: a.name, pokemon_b_fr: b.name, ...simulateBattle(a, b) } };
}

const ronflex = fighter("Ronflex", ["normal"], 160, 110, 65, 30);
const ectoplasma = fighter("Ectoplasma", ["ghost", "poison"], 60, 65, 60, 110);
const pikachu = fighter("Pikachu", ["electric"], 35, 55, 40, 90);
const onix = fighter("Onix", ["rock", "ground"], 35, 45, 160, 70);
const carapuce = fighter("Carapuce", ["water"], 44, 48, 65, 43);
const salameche = fighter("Salamèche", ["fire"], 39, 52, 43, 65);

describe("battle answer", () => {
  test("Ronflex / Ectoplasma: the Normal attacks of Ronflex have no effect (x0)", () => {
    expect(battleAnswer([battle(ronflex, ectoplasma)])).toBe(
      "Ectoplasma gagne contre Ronflex en 8 tours. Les attaques Normal de Ronflex n'ont aucun effet sur Ectoplasma (x0).",
    );
  });

  test("Pikachu / Onix: the Électrik attacks of Pikachu have no effect, Onix wins in 1 turn", () => {
    expect(battleAnswer([battle(pikachu, onix)])).toBe("Onix gagne contre Pikachu en 1 tour. Les attaques Électrik de Pikachu n'ont aucun effet sur Onix (x0).");
  });

  test("Carapuce / Salamèche: the Eau attack of Carapuce is super effective (x2)", () => {
    expect(battleAnswer([battle(carapuce, salameche)])).toBe(
      "Carapuce gagne contre Salamèche en 1 tour. L'attaque Eau de Carapuce est super efficace contre Salamèche (x2).",
    );
  });

  test("without a successful simulate_battle there is no battle answer", () => {
    expect(battleAnswer([])).toBeNull();
    expect(battleAnswer([{ name: "simulate_battle", arguments: {}, result: null, error: "not found", durationMs: 1 }])).toBeNull();
  });

  test("answer(): the text of the model is ignored, the same 2 sentences in the stream and in the response, grounded", async () => {
    const replies: OllamaMessage[] = [
      { role: "assistant", content: "", tool_calls: [{ function: { name: "simulate_battle", arguments: { pokemon_a: "Ronflex", pokemon_b: "Ectoplasma" } } }] },
      { role: "assistant", content: "Ronflex gagne facilement en 3 tours grâce à sa force." },
    ];
    let call = 0;
    const chat: ChatFn = async () => ({ message: replies[call++]! });
    const result = { ...battle(ronflex, ectoplasma).result as object, pokemon_a: "snorlax", pokemon_b: "gengar" };
    const tool = { name: "simulate_battle", description: "", schema: z.object({ pokemon_a: z.string(), pokemon_b: z.string() }), execute: () => result };
    const events: StreamEvent[] = [];
    const response = await answer([{ role: "user", content: "Qui gagne entre Ronflex et Ectoplasma ?" }], {
      chat,
      tools: new Map([["simulate_battle", tool as never]]),
      onEvent: (e) => events.push(e),
    });
    expect(response.reply).toBe("Ectoplasma gagne contre Ronflex en 8 tours. Les attaques Normal de Ronflex n'ont aucun effet sur Ectoplasma (x0).");
    expect(events.filter((e) => e.type === "token")).toEqual([{ type: "token", content: response.reply }]);
    expect(response).toMatchObject({ grounded: true, unverified_battle: [] });
  });
});
