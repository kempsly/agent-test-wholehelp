// Forced retry: if the first model step calls no tool but its answer cites a Pokemon, a type or a number (so it
// answers from memory), the same step is asked again once, without the history, with a system reminder to call the
// right tool first.
// Done by wrapping the chat function: the agent loop (agent.ts) is unchanged.

import type { ChatFn, OllamaMessage } from "./ollama";
import { citedTypes } from "./grounding";
import { leaksSystemPrompt } from "./outputGuard";
import { citesPokemon, lastCitedPokemon } from "./tools/frenchNames";

export const TOOL_REMINDER =
  "Appelle d'abord l'outil adapté (get_pokemon, get_type_matchups, get_evolution_chain ou simulate_battle) avec le nom exact " +
  "donné par l'utilisateur, puis réponds uniquement à partir de son résultat. Si la question ne porte sur aucun Pokémon ni aucun type, réponds sans outil.";

/**
 * The Pokemon the conversation is about, for a follow-up question that names none ("et sa vitesse ?"): the last
 * Pokemon cited in the history (most recent message first), extracted in code. Null if the question names a Pokemon
 * itself (the name of the history could mislead) or if the history cites none.
 */
export function contextPokemon(messages: OllamaMessage[]): string | null {
  const questionIndex = messages.map((m) => m.role).lastIndexOf("user");
  if (questionIndex < 0 || citesPokemon(messages[questionIndex]!.content)) return null;
  for (let i = questionIndex - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "user" && m.role !== "assistant") continue;
    const name = lastCitedPokemon(m.content);
    if (name) return name;
  }
  return null;
}

/** True if a text answer cites a Pokemon, a type or a number: such an answer needs a tool. */
export function needsTool(reply: string): boolean {
  return /\d/.test(reply) || citedTypes(reply).length > 0 || citesPokemon(reply);
}

export interface ToolReminderState {
  /** The first step answered without tool while citing data, and was asked again. */
  retried: boolean;
}

/** Wraps the chat function: only its first call can be retried, once. */
export function withToolReminder(chat: ChatFn): { chat: ChatFn; state: ToolReminderState } {
  const state: ToolReminderState = { retried: false };
  let firstCall = true;
  const wrapped: ChatFn = async (messages, tools) => {
    const result = await chat(messages, tools);
    if (!firstCall) return result;
    firstCall = false;
    if ((result.message.tool_calls?.length ?? 0) > 0 || !needsTool(result.message.content)) return result;
    // A copy of the prompt is replaced by the polite refusal (output check): it is a refusal, not an answer from memory.
    if (leaksSystemPrompt(result.message.content)) return result;
    state.retried = true;
    // Without the history: alone, the question gets its tool call (9 times out of 9 measured); with the history, the
    // model copies its previous answers. Only the system prompt, the current question and the reminder are sent.
    const system = messages.find((m) => m.role === "system");
    const question = [...messages].reverse().find((m) => m.role === "user");
    // The history is dropped, but not the Pokemon it is about: "et sa vitesse ?" keeps "pikachu".
    const pokemon = contextPokemon(messages);
    const reminder = pokemon ? `${TOOL_REMINDER} Pokémon dont on parle : ${pokemon}.` : TOOL_REMINDER;
    return chat([...(system ? [system] : []), ...(question ? [question] : []), { role: "system", content: reminder }], tools);
  };
  return { chat: wrapped, state };
}
