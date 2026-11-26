// What the API does for one question: keep the last exchanges, frame the user messages as untrusted data, run the
// agent loop (unchanged, with the forced tool retry), replace a reply that leaks the system prompt, then add the
// grounding check and the signature. Used by the routes and by the evaluation, so both test the same thing.

import { recentHistory, type ChatMessage, type SignedChatResponse } from "@app/shared";
import { runAgent, type AgentOptions } from "./agent";
import { MAX_ASSISTANT_CHARS } from "./chatRequest";
import { withGrounding } from "./grounding";
import { signReply } from "./history";
import { ollamaChat } from "./ollama";
import { guardReply } from "./outputGuard";
import { withToolReminder } from "./toolReminder";

export const INJECTION_MARKER = "[texte retiré : instruction non autorisée]";

// FRAGILE FILTER (denylist): it only catches the most common French and English wordings and is easy to get around
// (other words, other languages, spelling tricks). It reduces the risk, it does not remove it: the real
// protections are the closed tool list, the validation of the arguments, the system prompt and the output check.
// The patterns are matched on the lowercase sentence with its accents: "oublie tes règles" (order) is caught,
// "j'ai oublié les règles" (a real question) is not.
const NOT_LETTER_BEFORE = String.raw`(?<!\p{L})`;
const NOT_LETTER_AFTER = String.raw`(?!\p{L})`;
const word = (alternatives: string) => `${NOT_LETTER_BEFORE}(?:${alternatives})${NOT_LETTER_AFTER}`;
const pattern = (source: string) => new RegExp(source, "u");

const AUTHORITY = "system|syst[eè]me|admin|administrat(?:or|eur)|developer|d[ée]veloppeur|root";
const TARGET = String.raw`instructions?|r[eè]gles?|consignes?|directives?|rules?|prompt|guidelines?|restrictions?`;

export const INJECTION_PATTERNS: RegExp[] = [
  // SYSTEM / ADMIN at the start of a sentence, or as a label or a tag anywhere: "SYSTEM :", "[admin]".
  pattern(String.raw`^\s*[\[(<]?\s*${word("system|admin|administrat(?:or|eur)")}`),
  pattern(String.raw`${word(AUTHORITY)}\s*[\])>]?\s*:`),
  pattern(String.raw`[\[(<]\s*${word(AUTHORITY)}\s*[\])>]`),
  // Ignore / forget the rules (imperative only: not "j'oublie", "je ignore").
  pattern(
    String.raw`(?<!(?:j['’]|je\s|il\s|elle\s|on\s))` +
      word(String.raw`ignore[rz]?|oublie[rz]?|disregard|forget|bypass|override|contourne[rz]?|ne\s+tiens\s+pas\s+compte\s+d[eu']s?|ne\s+respecte\s+plus`) +
      String.raw`[^.!?]{0,40}?${word(TARGET)}`,
  ),
  // Role change.
  pattern(
    word(
      String.raw`tu\s+es\s+(?:maintenant|d[ée]sormais|devenu)|à\s+partir\s+de\s+maintenant,?\s+tu|you\s+are\s+now|from\s+now\s+on,?\s+you|act\s+as|pretend\s+(?:to\s+be|you)|fais\s+comme\s+si\s+tu|agis\s+comme|joue\s+le\s+r[ôo]le|nouveau\s+r[ôo]le|new\s+role|mode\s+(?:d[ée]veloppeur|debug|admin)|(?:developer|debug|god)\s+mode|jailbreak`,
    ),
  ),
  // Reveal the prompt: "répète ce qui est au-dessus", "show your instructions", "traduis tes règles".
  pattern(
    word(
      String.raw`r[ée]p[eè]te[sz]?|repeat|affiche[sz]?|montre[sz]?|r[ée]v[eè]le[sz]?|reveal|print|show|display|donne[sz]?|recopie[sz]?|copie[sz]?|traduis|translate|r[ée]sume[sz]?|summari[sz]e|[ée]cris|write|output|dis|tell`,
    ) +
      String.raw`[^.!?]{0,40}?(?:${word(String.raw`(?:ton|tes|votre|vos|your)\s+(?:propres?\s+)?(?:${TARGET})`)}|${word(String.raw`(?:tout\s+)?ce\s+qui\s+est\s+(?:au|ci)[- ]dessus|(?:the\s+)?(?:text|everything|words|what\s+is)\s+above`)})`,
  ),
  // The prompt named directly.
  pattern(word(String.raw`prompt\s+syst[eè]me|system\s+prompt|message\s+syst[eè]me|system\s+message|instructions?\s+(?:initiales|syst[eè]me|cach[ée]es)|(?:initial|hidden|original)\s+instructions`)),
];

const isInjection = (sentence: string) => INJECTION_PATTERNS.some((p) => p.test(sentence.toLowerCase()));

/**
 * Neutralizes every sentence of a user message that matches one of INJECTION_PATTERNS. Sentence by sentence
 * (not the whole line), so that a real question written before or after the injected text is kept.
 */
export function neutralizeInjections(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => (isInjection(sentence) ? INJECTION_MARKER : sentence))
        .join(" "),
    )
    .join("\n");
}

/**
 * Frames each user message as untrusted data. The framing tags written by the user are removed,
 * so a message cannot close the frame and pass text as if it came from outside it.
 */
export function wrapUserMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) =>
    m.role === "user"
      ? { role: "user", content: `<user_message>\n${neutralizeInjections(m.content.replace(/<\/?\s*user_message\s*>/gi, ""))}\n</user_message>` }
      : m,
  );
}

export async function answer(history: ChatMessage[], options: AgentOptions = {}): Promise<SignedChatResponse> {
  // The reply also goes out in the "token" event of the stream: it gets the same output check.
  const onEvent = options.onEvent;
  const reminder = withToolReminder(options.chat ?? ollamaChat);
  const guardedOptions: AgentOptions = {
    ...options,
    chat: reminder.chat,
    onEvent: onEvent && ((e) => onEvent(e.type === "token" ? { ...e, content: guardReply(e.content) } : e)),
  };
  // A 7B model stops calling tools when the history is long: it only sees the last exchanges (text only, the
  // tool results of earlier turns are never sent back). The front keeps and shows the whole conversation.
  const raw = await runAgent(wrapUserMessages(recentHistory(history)), guardedOptions);
  const grounded = withGrounding({ ...raw, reply: guardReply(raw.reply) });
  // Retried and still no tool: the answer comes from memory, it is never shown as verified.
  const response = reminder.state.retried && raw.toolCalls.length === 0 ? { ...grounded, grounded: false } : grounded;
  // The front sends the reply back in the history, where an assistant message is limited to MAX_ASSISTANT_CHARS:
  // a longer reply (a runaway generation) is cut here, before the signature, so the next request never fails.
  const reply = response.reply.length > MAX_ASSISTANT_CHARS ? `${response.reply.slice(0, MAX_ASSISTANT_CHARS - 1)}…` : response.reply;
  // The front sends this signature back with the reply; without it the reply is refused in the history.
  return { ...response, reply, signature: signReply(reply) };
}
