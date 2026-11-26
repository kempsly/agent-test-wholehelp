// Output check: an answer that contains an excerpt of at least LEAK_MIN_CHARS consecutive characters of the
// system prompt is replaced by a polite refusal. Comparison without case, accents, punctuation or extra spaces, so that a
// lightly rewritten copy is caught too. A paraphrase or a summary is not caught: this is a last barrier, not a proof.

import { buildSystemPrompt } from "./prompt";

export const LEAK_MIN_CHARS = 30;
export const LEAK_REFUSAL =
  "Je ne peux pas partager mes instructions internes. Je peux en revanche répondre à vos questions sur les Pokémon.";

/** Lowercase, no accents, punctuation and spaces turned into single spaces. */
const normalize = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Sentences that the prompt asks the model to say in its answers: they are not leaks (padded with spaces, so the
 * separator before or after them does not make a leak either). */
export const ALLOWED_PHRASES = [
  "C'est une simulation simplifiée",
  "Un type absent de ces listes inflige des dégâts normaux (x1)",
].map((phrase) => ` ${normalize(phrase)} `);

/** Every excerpt of LEAK_MIN_CHARS characters of a text, normalized, except those inside an allowed phrase. */
function excerpts(text: string): Set<string> {
  const normalized = normalize(text);
  const found = new Set<string>();
  for (let i = 0; i + LEAK_MIN_CHARS <= normalized.length; i++) {
    const excerpt = normalized.slice(i, i + LEAK_MIN_CHARS);
    if (!ALLOWED_PHRASES.some((phrase) => phrase.includes(excerpt))) found.add(excerpt);
  }
  return found;
}

const PROMPT_EXCERPTS = excerpts(buildSystemPrompt());

/** True if the reply contains an excerpt of at least LEAK_MIN_CHARS characters of the system prompt. */
export function leaksSystemPrompt(reply: string, promptExcerpts: Set<string> = PROMPT_EXCERPTS): boolean {
  const normalized = normalize(reply);
  for (let i = 0; i + LEAK_MIN_CHARS <= normalized.length; i++) {
    if (promptExcerpts.has(normalized.slice(i, i + LEAK_MIN_CHARS))) return true;
  }
  return false;
}

/**
 * Removes what the prompt forbids and the model still writes: Markdown (** and #) and Chinese / Japanese characters
 * (qwen2.5 writes "(英 : Mewtwo)"). Full-width punctuation becomes ASCII; a bracket left empty is removed.
 */
export function cleanFormatting(reply: string): string {
  return reply
    .replace(/\*\*/g, "")
    .replace(/#/g, "")
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}　-〿]/gu, "")
    .replace(/\(\s*:\s*/g, "(")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,])/g, "$1")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .trim();
}

/** The reply cleaned of forbidden formatting, or the refusal if it leaks the system prompt. */
export function guardReply(reply: string): string {
  return leaksSystemPrompt(reply) ? LEAK_REFUSAL : cleanFormatting(reply);
}
