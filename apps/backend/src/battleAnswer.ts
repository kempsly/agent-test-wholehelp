// Answers about battles: as for the evolutions (evolutionAnswer.ts), the answer is written in code. When
// simulate_battle succeeded in the turn, the answer is exactly 2 sentences built from its result (winner, then the
// main reason read in the log); the text of the model is ignored.

import type { ToolTrace } from "@app/shared";

interface LogEntry {
  turn: number;
  attacker: string;
  attack_type_fr: string;
  effectiveness: number;
  damage: number;
}

interface BattleResult {
  pokemon_a_fr: string;
  pokemon_b_fr: string;
  winner: string | null;
  turns: number;
  log: LogEntry[];
}

const isBattleResult = (value: unknown): value is BattleResult => {
  if (typeof value !== "object" || value === null) return false;
  const r = value as BattleResult;
  return typeof r.pokemon_a_fr === "string" && typeof r.pokemon_b_fr === "string" && typeof r.turns === "number" && Array.isArray(r.log) && (r.winner === null || typeof r.winner === "string");
};

/** Results of the successful simulate_battle calls of the turn. */
export function battleResults(toolCalls: ToolTrace[]): BattleResult[] {
  return toolCalls.filter((t) => t.name === "simulate_battle" && !t.error && isBattleResult(t.result)).map((t) => t.result as BattleResult);
}

/** "x2", "x0,5": French decimal comma. */
const multiplier = (m: number) => `x${String(m).replace(".", ",")}`;
const turnsText = (n: number) => `${n} tour${n > 1 ? "s" : ""}`;

/** Hits of one side, read from the log. With the same name on both sides, A attacks first and the log alternates. */
function hitsOf(r: BattleResult, side: 0 | 1): LogEntry[] {
  const name = side === 0 ? r.pokemon_a_fr : r.pokemon_b_fr;
  if (r.pokemon_a_fr !== r.pokemon_b_fr) return r.log.filter((e) => e.attacker === name);
  const first = r.log[0]?.attacker === name ? side : 1 - side;
  return r.log.filter((_, i) => i % 2 === first);
}

const typesOf = (hits: LogEntry[]) => [...new Set(hits.map((e) => e.attack_type_fr))].join(" et ");

/**
 * The main reason, by priority: the loser cannot hurt the winner (x0), the winner hits super effectively (x2, x4),
 * the loser hits not very effectively (x0,5, x0,25), otherwise the damage per hit (or a KO before any answer).
 */
function reason(r: BattleResult, winner: string, loser: string, winnerHits: LogEntry[], loserHits: LogEntry[]): string {
  const best = (hits: LogEntry[]) => hits.reduce<LogEntry | undefined>((a, e) => (a === undefined || e.effectiveness > a.effectiveness ? e : a), undefined);
  const w = best(winnerHits);
  const l = best(loserHits);
  if (l && l.effectiveness === 0) return `Les attaques ${typesOf(loserHits)} de ${loser} n'ont aucun effet sur ${winner} (x0).`;
  if (w && w.effectiveness > 1) return `L'attaque ${w.attack_type_fr} de ${winner} est super efficace contre ${loser} (${multiplier(w.effectiveness)}).`;
  if (l && l.effectiveness < 1) return `Les attaques ${typesOf(loserHits)} de ${loser} sont peu efficaces contre ${winner} (${multiplier(l.effectiveness)}).`;
  if (!l && w) return `${winner} attaque en premier et met ${loser} K.O. avant sa première attaque (${w.damage} dégâts).`;
  if (w && l) return `${winner} inflige ${w.damage} dégâts par attaque, contre ${l.damage} pour ${loser}.`;
  return `C'est une simulation simplifiée sur ${turnsText(r.turns)}.`;
}

/** The 2 sentences of one battle: "{winner} gagne contre {loser} en {n} tour(s)." then the main reason. */
export function battleSummary(r: BattleResult): string {
  const [a, b] = [r.pokemon_a_fr, r.pokemon_b_fr];
  if (r.winner === null) {
    const [ha, hb] = [hitsOf(r, 0), hitsOf(r, 1)];
    const harmless = ha.every((e) => e.effectiveness === 0) && hb.every((e) => e.effectiveness === 0);
    return harmless
      ? `Match nul entre ${a} et ${b} après ${turnsText(r.turns)}. Aucun des deux ne peut blesser l'autre (x0).`
      : `Match nul entre ${a} et ${b} après ${turnsText(r.turns)}. Aucun K.O. avant la limite de tours de la simulation.`;
  }
  const winnerSide: 0 | 1 = r.winner === a ? 0 : 1;
  const loser = winnerSide === 0 ? b : a;
  const first = `${r.winner} gagne contre ${loser} en ${turnsText(r.turns)}.`;
  return `${first} ${reason(r, r.winner, loser, hitsOf(r, winnerSide), hitsOf(r, winnerSide === 0 ? 1 : 0))}`;
}

/** The answer of a turn with a battle: the code-written summary of each battle, the text of the model is ignored. */
export function battleAnswer(toolCalls: ToolTrace[]): string | null {
  const results = battleResults(toolCalls);
  return results.length === 0 ? null : [...new Set(results.map(battleSummary))].join("\n");
}
