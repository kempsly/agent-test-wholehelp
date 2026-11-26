// Answers about weaknesses, resistances and immunities: as for the evolutions (evolutionAnswer.ts), the lists are
// never written by the model. When get_type_matchups succeeded in the turn, the answer is one introduction sentence
// from the model followed by summary_fr, written in code by the tool from the multipliers and added here as it is.

import type { ToolTrace } from "@app/shared";
import { citedTypes } from "./grounding";
import { fromName } from "./tools/pokemon";

interface MatchupResult {
  summary_fr: string;
  pokemon_fr?: string;
  defender_types: string[];
  defender_types_fr: string[];
}

const isMatchupResult = (value: unknown): value is MatchupResult =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as MatchupResult).summary_fr === "string" &&
  Array.isArray((value as MatchupResult).defender_types) &&
  Array.isArray((value as MatchupResult).defender_types_fr);

/** Results of the successful get_type_matchups calls of the turn. */
export function matchupResults(toolCalls: ToolTrace[]): MatchupResult[] {
  return toolCalls.filter((t) => t.name === "get_type_matchups" && !t.error && isMatchupResult(t.result)).map((t) => t.result as MatchupResult);
}

/** First sentence of the first non-empty line of the model answer. */
function firstSentence(reply: string): string {
  const line = reply.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return line.split(/(?<=[.!?:])\s+/)[0]!.trim();
}

/** Fixed introduction: "Faiblesses et résistances d'Ectoplasma (Spectre, Poison) :" or "... du type Feu :". */
function fixedIntro(r: MatchupResult): string {
  const types = r.defender_types_fr.join(", ");
  if (r.pokemon_fr) return `Faiblesses et résistances ${fromName(r.pokemon_fr)} (${types}) :`;
  return r.defender_types_fr.length > 1 ? `Faiblesses et résistances des types ${r.defender_types_fr.join(" et ")} :` : `Faiblesses et résistances du type ${types} :`;
}

/**
 * The answer with the code-written lists. The model keeps only its introduction sentence, and only if it cites no
 * number and no type other than the defender's own types (it would be a multiplier, maybe a wrong one). With several
 * results (two Pokemon compared), each list after the first one gets its own fixed introduction.
 * afterCode: the answer already ends with code-written text (evolutions): each list is appended with its introduction.
 */
export function addMatchupSummaries(reply: string, toolCalls: ToolTrace[], afterCode = false): string {
  const results = matchupResults(toolCalls);
  if (results.length === 0) return reply;
  const blocks = [...new Set(results.map((r, i) => (i === 0 && !afterCode ? r.summary_fr : `${fixedIntro(r)}\n${r.summary_fr}`)))];
  if (afterCode) return [reply, ...blocks].join("\n");
  const sentence = firstSentence(reply);
  const defenderTypes = new Set(results.flatMap((r) => r.defender_types));
  const safe = sentence.length > 0 && !/\d/.test(sentence) && citedTypes(sentence).every((t) => defenderTypes.has(t));
  return [safe ? sentence : fixedIntro(results[0]!), ...blocks].join("\n");
}
