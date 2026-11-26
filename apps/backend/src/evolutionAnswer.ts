// Answers about evolutions: the list of the evolutions and their conditions is never written by the model. When
// get_evolution_chain succeeded in the turn, the answer is one introduction sentence from the model (without any
// condition) followed by summary_fr, written in code by the tool and added here as it is.

import type { ToolTrace } from "@app/shared";
import { fromName } from "./tools/pokemon";

interface EvolutionResult {
  summary_fr: string;
  stages: { pokemon: { name: string; name_fr?: string; condition_fr?: string }[] }[];
}

const isEvolutionResult = (value: unknown): value is EvolutionResult =>
  typeof value === "object" && value !== null && typeof (value as EvolutionResult).summary_fr === "string" && Array.isArray((value as EvolutionResult).stages);

/** Results of the successful get_evolution_chain calls of the turn. */
export function evolutionResults(toolCalls: ToolTrace[]): EvolutionResult[] {
  return toolCalls.filter((t) => t.name === "get_evolution_chain" && !t.error && isEvolutionResult(t.result)).map((t) => t.result as EvolutionResult);
}

/** Each evolution (not the first stage) with its own condition: the pairs the answer must respect. */
export function evolutionPairs(toolCalls: ToolTrace[]): { name: string; condition: string }[] {
  return evolutionResults(toolCalls).flatMap((r) =>
    r.stages.flatMap((s) => s.pokemon).flatMap((p) => (p.condition_fr === undefined ? [] : [{ name: p.name_fr ?? p.name, condition: p.condition_fr }])),
  );
}

export const normalizeForMatch = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Position of the name cited as a whole word in the text (accents and case ignored), or -1. */
export function nameIndex(text: string, name: string): number {
  const escaped = normalizeForMatch(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return normalizeForMatch(text).search(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u"));
}

export const citesName = (text: string, name: string) => nameIndex(text, name) >= 0;

/** First sentence of the first non-empty line of the model answer. */
function firstSentence(reply: string): string {
  const line = reply.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return line.split(/(?<=[.!?:])\s+/)[0]!.trim();
}

/**
 * The answer with the code-written list of evolutions. The model keeps only its introduction sentence, and only if it
 * cites no evolution and no number (it would be a condition, maybe on the wrong Pokemon); otherwise a fixed one is used.
 */
export function addEvolutionSummaries(reply: string, toolCalls: ToolTrace[]): string {
  const results = evolutionResults(toolCalls);
  if (results.length === 0) return reply;
  const summaries = [...new Set(results.map((r) => r.summary_fr))];
  const evolutionNames = evolutionPairs(toolCalls).map((p) => p.name);
  const sentence = firstSentence(reply);
  const safe = sentence.length > 0 && !/\d/.test(sentence) && !evolutionNames.some((name) => citesName(sentence, name));
  const base = results[0]!.stages[0]?.pokemon[0];
  const intro = safe ? sentence : `Évolutions ${fromName(base ? (base.name_fr ?? base.name) : "ce Pokémon")} :`;
  return [intro, ...summaries].join("\n");
}
