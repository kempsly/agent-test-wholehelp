// Forced retry: if the first model step calls no tool but its answer cites a Pokemon, a type or a number (so it
// answers from memory), the same step is asked again once, with a system reminder to call the right tool first.
// Done by wrapping the chat function: the agent loop (agent.ts) is unchanged.

import type { ChatFn } from "./ollama";
import { citedTypes } from "./grounding";
import { citesPokemon } from "./tools/frenchNames";

export const TOOL_REMINDER =
  "Appelle d'abord l'outil adapté (get_pokemon, get_type_matchups, get_evolution_chain ou simulate_battle) avec le nom exact " +
  "donné par l'utilisateur, puis réponds uniquement à partir de son résultat. Si la question ne porte sur aucun Pokémon ni aucun type, réponds sans outil.";

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
    state.retried = true;
    return chat([...messages, { role: "system", content: TOOL_REMINDER }], tools);
  };
  return { chat: wrapped, state };
}
