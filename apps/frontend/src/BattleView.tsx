import { useEffect, useMemo, useState } from "react";

// Shows the result of the simulate_battle tool: two Pokemon, HP bars, turn-by-turn replay, log and winner.
// Only the data of the tool result is used, and everything is rendered as plain text (no HTML injected).

const TURN_DURATION_MS = 800;

interface LogEntry {
  turn: number;
  attacker: string;
  defender: string;
  attackTypeFr: string;
  effectiveness: number;
  damage: number;
  defenderHpLeft: number;
  /** Side of the attacker: 0 = first Pokemon (A), 1 = second (B). */
  side: 0 | 1;
}

interface Battle {
  names: [string, string];
  finalHp: [number, number];
  /**
   * Starting HP, deduced from the log (the tool result does not give it): HP left + damage of the first hit received.
   * Exact, except when the very first hit is already a KO (then the damage of that hit is shown).
   */
  initialHp: [number, number];
  turns: LogEntry[][];
  /** Attack types used by each side, from the log. */
  attackTypes: [string[], string[]];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Reads the tool result with checks: anything unexpected gives null and nothing is displayed. */
export function parseBattle(result: unknown): Battle | null {
  if (!isRecord(result) || !Array.isArray(result.log) || !Array.isArray(result.final_hp) || result.final_hp.length !== 2) return null;

  const final = result.final_hp.map((f) =>
    isRecord(f) && typeof f.name === "string" && typeof f.hp === "number" ? { name: f.name, hp: f.hp } : null,
  );
  if (final[0] === null || final[1] === null) return null;
  const [a, b] = final as [{ name: string; hp: number }, { name: string; hp: number }];

  const log: LogEntry[] = [];
  for (const [i, raw] of result.log.entries()) {
    if (
      !isRecord(raw) ||
      typeof raw.turn !== "number" ||
      typeof raw.attacker !== "string" ||
      typeof raw.defender !== "string" ||
      typeof raw.attack_type_fr !== "string" ||
      typeof raw.effectiveness !== "number" ||
      typeof raw.damage !== "number" ||
      typeof raw.defender_hp_left !== "number"
    ) {
      return null;
    }
    // Same name on both sides: A attacks first and the log alternates, so the position gives the side.
    const side = a.name === b.name ? i % 2 : raw.attacker === a.name ? 0 : 1;
    log.push({
      turn: raw.turn,
      attacker: raw.attacker,
      defender: raw.defender,
      attackTypeFr: raw.attack_type_fr,
      effectiveness: raw.effectiveness,
      damage: raw.damage,
      defenderHpLeft: raw.defender_hp_left,
      side: side as 0 | 1,
    });
  }
  if (log.length === 0) return null;

  // The last hit of a KO can deal more damage than the HP left, so the damage is not simply summed.
  const startHp = (side: 0 | 1) => {
    const firstHit = log.find((e) => e.side !== side);
    return firstHit ? firstHit.defenderHpLeft + firstHit.damage : side === 0 ? a.hp : b.hp;
  };
  const turns: LogEntry[][] = [];
  for (const entry of log) (turns[entry.turn - 1] ??= []).push(entry);

  const typesOf = (side: 0 | 1) => [...new Set(log.filter((e) => e.side === side).map((e) => e.attackTypeFr))];
  return {
    names: [a.name, b.name],
    finalHp: [a.hp, b.hp],
    initialHp: [startHp(0), startHp(1)],
    turns: turns.filter(Boolean),
    attackTypes: [typesOf(0), typesOf(1)],
  };
}

function describeHit(e: LogEntry): string {
  const effect = e.damage === 0 ? "aucun effet" : `${e.damage} dégâts`;
  return `Tour ${e.turn} : ${e.attacker} attaque ${e.defender} avec ${e.attackTypeFr} (efficacité x${e.effectiveness}) : ${effect}`;
}

export function BattleView({ result }: { result: unknown }) {
  const battle = useMemo(() => parseBattle(result), [result]);
  // At first the whole fight is shown; "Rejouer le combat" replays it turn by turn.
  const [turnsShown, setTurnsShown] = useState(battle?.turns.length ?? 0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setTurnsShown((n) => n + 1), TURN_DURATION_MS);
    return () => clearInterval(id);
  }, [playing]);

  useEffect(() => {
    if (battle && turnsShown >= battle.turns.length) setPlaying(false);
  }, [battle, turnsShown]);

  if (!battle) return null;

  const shown = battle.turns.slice(0, turnsShown).flat();
  const finished = turnsShown >= battle.turns.length;
  const hpOf = (side: 0 | 1) => [...shown].reverse().find((e) => e.side !== side)?.defenderHpLeft ?? battle.initialHp[side];
  const winnerSide = battle.finalHp[0] > 0 && battle.finalHp[1] === 0 ? 0 : battle.finalHp[1] > 0 && battle.finalHp[0] === 0 ? 1 : null;

  function replay() {
    setTurnsShown(0);
    setPlaying(true);
  }

  return (
    <section className="battle" aria-label="Combat simulé">
      <div className="fighters">
        {([0, 1] as const).map((side) => {
          const hp = hpOf(side);
          const initial = battle.initialHp[side];
          const isWinner = finished && winnerSide === side;
          return (
            <div key={side} className={`fighter ${isWinner ? "winner" : ""}`}>
              <strong>{battle.names[side]}</strong>
              <span className="muted">Attaque : {battle.attackTypes[side].join(", ") || "aucune"}</span>
              <div className="hp-track" role="progressbar" aria-valuemin={0} aria-valuemax={initial} aria-valuenow={hp}>
                <div className="hp-fill" style={{ width: `${initial > 0 ? (100 * hp) / initial : 0}%` }} />
              </div>
              <span className="hp-value">
                PV {hp} / {initial}
              </span>
            </div>
          );
        })}
      </div>

      <div className="battle-actions">
        <button className="ghost" onClick={replay} disabled={playing}>
          Rejouer le combat
        </button>
        {finished && (
          <span className="winner-text">{winnerSide === null ? "Match nul" : `Vainqueur : ${battle.names[winnerSide]}`}</span>
        )}
      </div>

      <ol className="battle-log">
        {shown.map((e, i) => (
          <li key={i}>{describeHit(e)}</li>
        ))}
      </ol>
    </section>
  );
}
