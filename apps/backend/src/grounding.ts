// Grounding check (heuristic, assumed): after the final answer, every number and every type name cited in the
// answer must appear in what the tools returned during the turn (results and error messages). It cannot prove an answer is right,
// it detects numbers and types that no tool returned.

import type { ChatResponse, GroundedChatResponse, ToolTrace } from "@app/shared";
import { citesName, evolutionPairs, nameIndex, normalizeForMatch } from "./evolutionAnswer";
import { frenchNameOf } from "./tools/frenchNames";
import { POKEMON_TYPES, TYPE_FR, type PokemonType } from "./tools/pokemonTypes";

/** Numbers up to this value are not checked (multipliers like x2, counts like "2 types", stage numbers). */
const SMALL_NUMBER_MAX = 2;

/** Other spellings of a type that the model may use (the official French names come from TYPE_FR). */
const TYPE_VARIANTS: Partial<Record<PokemonType, string[]>> = {
  electric: ["electrique", "electricite"],
  psychic: ["psychique"],
};

const normalizeText = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Names under which each type can be cited, without accents: English, official French, variants. */
const TYPE_NAMES = Object.fromEntries(
  POKEMON_TYPES.map((type) => [type, [type, normalizeText(TYPE_FR[type]), ...(TYPE_VARIANTS[type] ?? [])]]),
) as Record<PokemonType, string[]>;

// A number, not glued to a letter, a digit or a separator before it; multipliers (x2, ×0,25) are skipped.
const NUMBER_PATTERN = /(?<![\w.,×])\d+(?:[.,]\d+)?/g;

const toValue = (token: string) => Number(token.replace(",", "."));

function extractNumbers(text: string): string[] {
  return text.match(NUMBER_PATTERN) ?? [];
}

/** Every number found in the tool results, as values (numbers and numbers written in texts). */
function numbersInResults(value: unknown, found = new Set<number>()): Set<number> {
  if (typeof value === "number") found.add(value);
  else if (typeof value === "string") extractNumbers(value).forEach((t) => found.add(toValue(t)));
  else if (Array.isArray(value)) value.forEach((v) => numbersInResults(v, found));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => numbersInResults(v, found));
  return found;
}

/**
 * French type names that are also common words: "le combat", "un vol", "c'est normal". In an answer they count as a
 * type only in a clear type context: "type Combat", "Combat (x2)", or "Combat" with a capital inside a sentence.
 */
const AMBIGUOUS_TYPES: Partial<Record<PokemonType, string>> = { fighting: "Combat", flying: "Vol", normal: "Normal" };

function citesAmbiguousType(text: string, label: string): boolean {
  const n = normalizeText(label);
  const normalized = normalizeText(text);
  return (
    new RegExp(`(?<![a-z-])types?\\s+(?:de\\s+|du\\s+)?${n}(?![a-z-])`).test(normalized) ||
    new RegExp(`(?<![a-z-])${n}\\s*\\(?\\s*[x×]\\s*\\d`).test(normalized) ||
    new RegExp(`(?<!^\\s{0,3})(?<![.!?:\\n]\\s{0,3})(?<![\\p{L}-])${label}(?![\\p{L}-])`, "u").test(text)
  );
}

/**
 * Types cited in a text. strict (for answers): the ambiguous French names need a type context. Not strict (for the
 * tool results): every mention counts.
 */
export function citedTypes(text: string, strict = true): PokemonType[] {
  const normalized = normalizeText(text);
  // A hyphen counts as part of the word: "deoxys-normal" or "water-absorb" are names, not type mentions.
  return POKEMON_TYPES.filter((type) =>
    TYPE_NAMES[type].some((name) => {
      const label = AMBIGUOUS_TYPES[type];
      // English names (fighting, flying) are not French words; "normal" is ambiguous in both languages.
      if (strict && label && name === normalizeText(label)) return citesAmbiguousType(text, label);
      return new RegExp(`(?<![a-z-])${name}(?![a-z-])`).test(normalized);
    }),
  );
}

export interface GroundingResult {
  grounded: boolean;
  unverified_numbers: string[];
  unverified_types: string[];
  /** Evolutions cited on a line without their own condition_fr (a condition put on another Pokemon). */
  unverified_evolutions: string[];
  /** Pokemon of a simulated battle that the question does not cite (the model passed other names or numbers). */
  unverified_battle: string[];
}

/** Numbers of an ordered list ("3. Tour 2 : ...") are not data. */
const LIST_MARKERS = /^\s*\d+[.)]\s/gm;

/**
 * Pair check: on each line that cites evolutions of get_evolution_chain, the first one cited (the subject of the line)
 * must come with its own condition_fr. "Aquali : amitié élevée, le jour" is flagged (that is the condition of Mentali).
 */
function unverifiedEvolutionPairs(reply: string, toolCalls: ToolTrace[]): string[] {
  const pairs = evolutionPairs(toolCalls);
  const flagged = new Set<string>();
  for (const line of reply.split("\n")) {
    const cited = pairs.map((p) => ({ ...p, at: nameIndex(line, p.name) })).filter((p) => p.at >= 0);
    if (cited.length === 0) continue;
    const subject = cited.reduce((a, b) => (b.at < a.at ? b : a));
    if (!normalizeForMatch(line).includes(normalizeForMatch(subject.condition))) flagged.add(subject.name);
  }
  return [...flagged];
}

/** True if the question cites this Pokemon by its English name (hyphen or space) or its French name. */
function questionCites(question: string, english: string): boolean {
  const french = frenchNameOf(english);
  return citesName(question, english) || citesName(question, english.replace(/-/g, " ")) || (french !== null && citesName(question, french));
}

/**
 * Battle check: both Pokemon of each successful simulate_battle must be cited in the question (French or English
 * name). "Qui gagne entre Ronflex et Ectoplasma ?" simulated as caterpie against relicanth is flagged.
 */
function unverifiedBattlePokemon(question: string, toolCalls: ToolTrace[]): string[] {
  if (!question) return [];
  const flagged = new Set<string>();
  for (const t of toolCalls) {
    if (t.name !== "simulate_battle" || t.error || typeof t.result !== "object" || t.result === null) continue;
    const r = t.result as Record<string, unknown>;
    for (const english of [r.pokemon_a, r.pokemon_b]) {
      if (typeof english === "string" && !questionCites(question, english)) flagged.add(frenchNameOf(english) ?? english);
    }
  }
  return [...flagged];
}

/**
 * Compares the answer with what the tools returned during the turn: results, or the error message of a failed call.
 * question: the user question of the turn, for the battle check (empty: not checked).
 */
export function checkGrounding(reply: string, toolCalls: ToolTrace[], question = ""): GroundingResult {
  const results = toolCalls.map((t) => (t.error ? t.error : t.result));
  const knownNumbers = numbersInResults(results);
  const knownTypes = new Set(citedTypes(JSON.stringify(results), false));

  const unverifiedNumbers = [
    ...new Set(extractNumbers(reply.replace(LIST_MARKERS, " ")).filter((t) => toValue(t) > SMALL_NUMBER_MAX && !knownNumbers.has(toValue(t)))),
  ];
  const unverifiedTypes = citedTypes(reply).filter((type) => !knownTypes.has(type));
  const unverifiedEvolutions = unverifiedEvolutionPairs(reply, toolCalls);
  const unverifiedBattle = unverifiedBattlePokemon(question, toolCalls);

  return {
    grounded: unverifiedNumbers.length === 0 && unverifiedTypes.length === 0 && unverifiedEvolutions.length === 0 && unverifiedBattle.length === 0,
    unverified_numbers: unverifiedNumbers,
    unverified_types: unverifiedTypes,
    unverified_evolutions: unverifiedEvolutions,
    unverified_battle: unverifiedBattle,
  };
}

/** Adds the grounding fields to the response of the agent (the agent loop itself is not involved). */
export function withGrounding(response: ChatResponse, question = ""): GroundedChatResponse {
  return { ...response, ...checkGrounding(response.reply, response.toolCalls, question) };
}
