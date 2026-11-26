// Grounding check (heuristic, assumed): after the final answer, every number and every type name cited in the
// answer must appear in the results of the tools called during the turn. It cannot prove an answer is right,
// it detects numbers and types that no tool returned.

import type { ChatResponse, GroundedChatResponse, ToolTrace } from "@app/shared";
import { POKEMON_TYPES, type PokemonType } from "./tools/typeMatchups";

/** Numbers up to this value are not checked (multipliers like x2, counts like "2 types", stage numbers). */
const SMALL_NUMBER_MAX = 2;

/** Names under which each type can be cited (English as returned by the tools, and French), without accents. */
const TYPE_NAMES: Record<PokemonType, string[]> = {
  normal: ["normal"],
  fire: ["fire", "feu"],
  water: ["water", "eau"],
  electric: ["electric", "electrik", "electrique", "electricite"],
  grass: ["grass", "plante"],
  ice: ["ice", "glace"],
  fighting: ["fighting", "combat"],
  poison: ["poison"],
  ground: ["ground", "sol"],
  flying: ["flying", "vol"],
  psychic: ["psychic", "psychique", "psy"],
  bug: ["bug", "insecte"],
  rock: ["rock", "roche"],
  ghost: ["ghost", "spectre"],
  dragon: ["dragon"],
  dark: ["dark", "tenebres"],
  steel: ["steel", "acier"],
  fairy: ["fairy", "fee"],
};

// A number, not glued to a letter, a digit or a separator before it; multipliers (x2, ×0,25) are skipped.
const NUMBER_PATTERN = /(?<![\w.,×])\d+(?:[.,]\d+)?/g;

const toValue = (token: string) => Number(token.replace(",", "."));

function extractNumbers(text: string): string[] {
  return text.match(NUMBER_PATTERN) ?? [];
}

const normalizeText = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Every number found in the tool results, as values (numbers and numbers written in texts). */
function numbersInResults(value: unknown, found = new Set<number>()): Set<number> {
  if (typeof value === "number") found.add(value);
  else if (typeof value === "string") extractNumbers(value).forEach((t) => found.add(toValue(t)));
  else if (Array.isArray(value)) value.forEach((v) => numbersInResults(v, found));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => numbersInResults(v, found));
  return found;
}

function citedTypes(text: string): PokemonType[] {
  const normalized = normalizeText(text);
  return POKEMON_TYPES.filter((type) =>
    TYPE_NAMES[type].some((name) => new RegExp(`(?<![a-z])${name}(?![a-z])`).test(normalized)),
  );
}

export interface GroundingResult {
  grounded: boolean;
  unverified_numbers: string[];
  unverified_types: string[];
}

/** Compares the answer with the results of the tool calls that succeeded during the turn. */
export function checkGrounding(reply: string, toolCalls: ToolTrace[]): GroundingResult {
  const results = toolCalls.filter((t) => !t.error).map((t) => t.result);
  const knownNumbers = numbersInResults(results);
  const knownTypes = new Set(citedTypes(JSON.stringify(results)));

  const unverifiedNumbers = [
    ...new Set(extractNumbers(reply).filter((t) => toValue(t) > SMALL_NUMBER_MAX && !knownNumbers.has(toValue(t)))),
  ];
  const unverifiedTypes = citedTypes(reply).filter((type) => !knownTypes.has(type));

  return {
    grounded: unverifiedNumbers.length === 0 && unverifiedTypes.length === 0,
    unverified_numbers: unverifiedNumbers,
    unverified_types: unverifiedTypes,
  };
}

/** Adds the grounding fields to the response of the agent (the agent loop itself is not involved). */
export function withGrounding(response: ChatResponse): GroundedChatResponse {
  return { ...response, ...checkGrounding(response.reply, response.toolCalls) };
}
