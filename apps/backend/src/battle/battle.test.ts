// Tests of the battle engine: pure functions, no network, no LLM.

import { describe, expect, test } from "bun:test";
import type { DefenderRelations } from "../tools/typeMatchups";
import type { PokemonType } from "../tools/pokemonTypes";
import { MAX_TURNS, bestAttackType, computeDamage, effectiveness, simulateBattle, type Fighter } from "./engine";

const relation = (double: string[], half: string[], none: string[]): DefenderRelations => ({
  double_damage_from: double,
  half_damage_from: half,
  no_damage_from: none,
});

/** How the types we use are hit when they defend (same data as PokeAPI). */
const RELATIONS: Partial<Record<PokemonType, DefenderRelations>> = {
  fire: relation(["water", "ground", "rock"], ["fire", "grass", "ice", "bug", "steel", "fairy"], []),
  flying: relation(["electric", "ice", "rock"], ["grass", "fighting", "bug"], ["ground"]),
  ghost: relation(["ghost", "dark"], ["poison", "bug"], ["normal", "fighting"]),
  normal: relation(["fighting"], [], ["ghost"]),
};

function fighter(name: string, types: PokemonType[], stats: Partial<Pick<Fighter, "hp" | "attack" | "defense" | "speed">> = {}): Fighter {
  return {
    name,
    types,
    defenderRelations: types.map((t) => RELATIONS[t]!),
    hp: 100,
    attack: 50,
    defense: 50,
    speed: 50,
    ...stats,
  };
}

describe("effectiveness and damage", () => {
  test("double type: rock is x4 against fire/flying (product of the two types)", () => {
    expect(effectiveness("rock", fighter("charizard", ["fire", "flying"]))).toBe(4);
    expect(effectiveness("water", fighter("charizard", ["fire", "flying"]))).toBe(2);
  });

  test("immunity: normal and fighting are x0 against a ghost, and the damage is 0", () => {
    const ghost = fighter("gastly", ["ghost"]);
    expect(effectiveness("normal", ghost)).toBe(0);
    expect(effectiveness("fighting", ghost)).toBe(0);
    expect(computeDamage(200, 10, 0)).toBe(0);
  });

  test("damage formula: floor(20 * attack / defense * effectiveness), at least 1 unless immune", () => {
    expect(computeDamage(100, 50, 1)).toBe(40);
    expect(computeDamage(100, 50, 4)).toBe(160);
    expect(computeDamage(1, 1000, 0.25)).toBe(1);
  });

  test("the attacker uses its own type that is the most effective (a normal type is useless against a ghost)", () => {
    const attacker = fighter("a", ["normal", "fire"]);
    expect(bestAttackType(attacker, fighter("b", ["ghost"]))).toEqual({ type: "fire", effectiveness: 1 });
  });
});

describe("simulateBattle", () => {
  test("the faster Pokemon attacks first, whoever it is", () => {
    const slow = fighter("slow", ["normal"], { speed: 10 });
    const fast = fighter("fast", ["normal"], { speed: 90 });
    expect(simulateBattle(slow, fast).log[0]!.attacker).toBe("fast");
    expect(simulateBattle(fast, slow).log[0]!.attacker).toBe("fast");
  });

  test("equal speed: Pokemon A attacks first", () => {
    const a = fighter("a", ["normal"], { speed: 70 });
    const b = fighter("b", ["normal"], { speed: 70 });
    expect(simulateBattle(a, b).log[0]!.attacker).toBe("a");
  });

  test("the battle ends at the KO: no attack after it, the winner is the one still standing", () => {
    const strong = fighter("strong", ["normal"], { attack: 200, speed: 80 });
    const weak = fighter("weak", ["normal"], { hp: 30, speed: 20 });
    const result = simulateBattle(strong, weak);
    expect(result.log).toHaveLength(1); // the weak one never gets to attack
    expect(result).toMatchObject({ winner: "strong", turns: 1 });
    expect(result.final_hp).toEqual([{ name: "strong", hp: 100 }, { name: "weak", hp: 0 }]);
  });

  test("a slower Pokemon can win: it survives the first hit and KOs back", () => {
    const fast = fighter("fast", ["normal"], { attack: 20, speed: 90, hp: 40 });
    const tank = fighter("tank", ["normal"], { attack: 150, defense: 100, speed: 10, hp: 200 });
    const result = simulateBattle(fast, tank);
    expect(result.winner).toBe("tank");
    expect(result.log.at(-1)).toMatchObject({ attacker: "tank", defender_hp_left: 0 });
  });

  test("normal against ghost: the normal type deals 0 and loses to the ghost's other type", () => {
    const snorlax = fighter("snorlax", ["normal"], { hp: 160, attack: 110, speed: 30 });
    const gengar = fighter("gengar", ["ghost", "fire"], { hp: 60, attack: 65, speed: 110 });
    const result = simulateBattle(snorlax, gengar);
    const snorlaxHit = result.log.find((e) => e.attacker === "snorlax")!;
    expect(snorlaxHit).toMatchObject({ effectiveness: 0, damage: 0 });
  });

  test("nobody can hurt the other: draw after MAX_TURNS, no winner", () => {
    const result = simulateBattle(fighter("a", ["normal"]), fighter("b", ["ghost"]));
    // normal vs ghost is x0, and ghost vs normal is x0: no damage at all
    expect(result.winner).toBeNull();
    expect(result.turns).toBe(MAX_TURNS);
    expect(result.log).toHaveLength(MAX_TURNS * 2);
  });

  test("is deterministic: same input, same result", () => {
    const a = fighter("a", ["fire", "flying"], { attack: 84, speed: 100 });
    const b = fighter("b", ["ghost"], { speed: 60 });
    expect(simulateBattle(a, b)).toEqual(simulateBattle(a, b));
  });
});
