// What the API does for one question: frame the user messages as untrusted data, run the agent loop
// (unchanged), then add the grounding check. Used by the routes and by the evaluation, so both test the same thing.

import type { ChatMessage, GroundedChatResponse } from "@app/shared";
import { runAgent, type AgentOptions } from "./agent";
import { withGrounding } from "./grounding";

export const INJECTION_MARKER = "[texte retiré : instruction non autorisée]";

// FRAGILE FILTER (denylist): it only catches the most common wordings and is easy to get around
// (other words, other languages, spelling tricks). It reduces the risk, it does not remove it: the real
// protections are the closed tool list, the validation of the arguments and the system prompt.
const STARTS_WITH_AUTHORITY = /^\s*(system|admin(istrat(or|eur))?)\b/i;
const IGNORE_INSTRUCTIONS = /ignore\s+(tes\s+instructions|previous\s+instructions)/i;

/**
 * Neutralizes the sentences of a user message that start with SYSTEM or ADMIN, or that contain
 * "ignore tes instructions" / "ignore previous instructions". Sentence by sentence (not the whole line), so that
 * a real question written after the injected text on the same line is kept.
 */
export function neutralizeInjections(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const sentences = line.split(/(?<=[.!?])\s+/);
      return sentences
        .map((sentence, i) =>
          (i === 0 && STARTS_WITH_AUTHORITY.test(sentence)) || IGNORE_INSTRUCTIONS.test(sentence) ? INJECTION_MARKER : sentence,
        )
        .join(" ");
    })
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

export async function answer(history: ChatMessage[], options?: AgentOptions): Promise<GroundedChatResponse> {
  return withGrounding(await runAgent(wrapUserMessages(history), options));
}
