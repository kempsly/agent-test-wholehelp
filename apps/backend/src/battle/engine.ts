// Battle engine (bonus): pure functions, no LLM, no network, no stored state. Same input, same result.
//
// Simplified rules (documented on purpose, this is not the real game):
// - Each Pokemon uses its own type that is the most effective against the defender (first type on a tie).
// - effectiveness = product of the multipliers on the defender's types (same calculation as get_type_matchups).
// - damage = floor(BASE_POWER * attack / defense * effectiveness), at least 1, except 0 when effectiveness is x0.
// - The faster Pokemon attacks first each turn; on equal speed, Pokemon A attacks first.
// - Turn by turn until one Pokemon is KO (hp 0): no attack after the KO. After MAX_TURNS the fight is a draw.

import { computeMultipliers, type DefenderRelations } from "../tools/typeMatchups";
import { typeFr, type PokemonType } from "../tools/pokemonTypes";

export const BASE_POWER = 20;
export const MAX_TURNS = 100;

export interface Fighter {
  name: string;
  types: PokemonType[];
  /** How each of the fighter's own types is hit (data from PokeAPI), used to compute the effectiveness against it. */
  defenderRelations: DefenderRelations[];
  hp: number;
  attack: number;
  defense: number;
  speed: number;
}

export interface BattleLogEntry {
  turn: number;
  attacker: string;
  defender: string;
  attack_type: PokemonType;
  attack_type_fr: string;
  effectiveness: number;
  damage: number;
  defender_hp_left: number;
}

export interface BattleResult {
  /** Name of the winner, or null for a draw (nobody can hurt the other, or MAX_TURNS reached). */
  winner: string | null;
  turns: number;
  log: BattleLogEntry[];
  final_hp: { name: string; hp: number }[];
}

/** Multiplier of an attacking type against a defender: product over the defender's types (x4, x2, x1, x0.5, x0.25, x0). */
export function effectiveness(attackType: PokemonType, defender: Pick<Fighter, "defenderRelations">): number {
  return computeMultipliers(defender.defenderRelations)[attackType];
}

/** The attacker's own type with the best effectiveness against the defender (first type on a tie). */
export function bestAttackType(attacker: Fighter, defender: Fighter): { type: PokemonType; effectiveness: number } {
  let best = { type: attacker.types[0]!, effectiveness: effectiveness(attacker.types[0]!, defender) };
  for (const type of attacker.types.slice(1)) {
    const value = effectiveness(type, defender);
    if (value > best.effectiveness) best = { type, effectiveness: value };
  }
  return best;
}

export function computeDamage(attack: number, defense: number, effectivenessValue: number): number {
  if (effectivenessValue === 0) return 0;
  return Math.max(1, Math.floor(((BASE_POWER * attack) / Math.max(1, defense)) * effectivenessValue));
}

export function simulateBattle(a: Fighter, b: Fighter): BattleResult {
  const hp = [a.hp, b.hp];
  const fighters = [a, b];
  const order = b.speed > a.speed ? [1, 0] : [0, 1]; // tie: A first
  const log: BattleLogEntry[] = [];
  let winner: number | null = null;
  let turns = 0;

  for (let turn = 1; turn <= MAX_TURNS && winner === null; turn++) {
    turns = turn;
    for (const i of order) {
      const attacker = fighters[i]!;
      const target = 1 - i;
      const defender = fighters[target]!;
      const choice = bestAttackType(attacker, defender);
      const damage = computeDamage(attacker.attack, defender.defense, choice.effectiveness);
      hp[target] = Math.max(0, hp[target]! - damage);
      log.push({
        turn,
        attacker: attacker.name,
        defender: defender.name,
        attack_type: choice.type,
        attack_type_fr: typeFr(choice.type),
        effectiveness: choice.effectiveness,
        damage,
        defender_hp_left: hp[target]!,
      });
      if (hp[target] === 0) {
        winner = i; // KO: no attack after it
        break;
      }
    }
  }

  return {
    winner: winner === null ? null : fighters[winner]!.name,
    turns,
    log,
    final_hp: [
      { name: a.name, hp: hp[0]! },
      { name: b.name, hp: hp[1]! },
    ],
  };
}
