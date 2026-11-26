// Tests of the history window (what the model sees) and of the forced tool retry, with a fake LLM.

import { afterEach, describe, expect, test } from "bun:test";
import { recentHistory, type ChatMessage } from "@app/shared";
import { answer } from "./answer";
import { config } from "./config";
import { signReply } from "./history";
import type { ChatFn, ChatResult, OllamaMessage } from "./ollama";
import { TOOL_REMINDER, needsTool } from "./toolReminder";

config.historySecret = "test-secret";
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const user = (content: string): ChatMessage => ({ role: "user", content });
const assistant = (content: string): ChatMessage => ({ role: "assistant", content, signature: signReply(content) });

/** A conversation of n exchanges, then a new question. */
function conversation(n: number): ChatMessage[] {
  return [...Array.from({ length: n }, (_, i) => [user(`Question ${i + 1}`), assistant(`Réponse ${i + 1}`)]).flat(), user("Nouvelle question")];
}

/** Fake LLM that plays the given answers in order and records what it received. */
function scripted(...replies: OllamaMessage[]) {
  const received: OllamaMessage[][] = [];
  const chat: ChatFn = async (messages): Promise<ChatResult> => {
    received.push(structuredClone(messages));
    return { message: replies[received.length - 1] ?? { role: "assistant", content: "Fin." } };
  };
  return { chat, received };
}
const text = (content: string): OllamaMessage => ({ role: "assistant", content });
const toolCall = (name: string, args: Record<string, unknown>): OllamaMessage => ({
  role: "assistant",
  content: "",
  tool_calls: [{ function: { name, arguments: args } }],
});

describe("history window", () => {
  test("keeps the new question and the 2 previous exchanges, in order", () => {
    expect(recentHistory(conversation(16)).map((m) => m.content)).toEqual(["Question 15", "Réponse 15", "Question 16", "Réponse 16", "Nouvelle question"]);
    expect(recentHistory(conversation(1)).map((m) => m.content)).toEqual(["Question 1", "Réponse 1", "Nouvelle question"]);
    expect(recentHistory([user("Salut")])).toEqual([user("Salut")]);
    expect(recentHistory([])).toEqual([]);
  });

  test("a question left without answer (error shown in the front) is skipped, the exchanges stay whole", () => {
    const messages = [user("Q1"), assistant("R1"), user("Q2"), assistant("R2"), user("Q3 sans réponse"), user("Q4")];
    expect(recentHistory(messages).map((m) => m.content)).toEqual(["Q1", "R1", "Q2", "R2", "Q4"]);
  });

  test("the model receives the system prompt, the last 2 exchanges and the question only (text, no tool result)", async () => {
    const { chat, received } = scripted(text("Bonjour, posez une question sur les Pokémon."));
    await answer(conversation(16), { chat });
    const sent = received[0]!;
    expect(sent.map((m) => m.role)).toEqual(["system", "user", "assistant", "user", "assistant", "user"]);
    expect(sent.at(-1)!.content).toContain("Nouvelle question");
    expect(sent.some((m) => m.role === "tool" || m.content.includes("Question 14"))).toBe(false);
  });
});

describe("forced tool retry", () => {
  test("needsTool: an answer that cites a Pokemon, a type or a number needs a tool; a refusal does not", () => {
    for (const reply of ["Pikachu est très rapide.", "Évoli a plusieurs évolutions.", "Il est faible contre le type Eau.", "Il a 35 PV."]) {
      expect(needsTool(reply)).toBe(true);
    }
    for (const reply of [
      "Je ne réponds qu'aux questions sur les Pokémon.",
      "Je n'ai pas trouvé Pikachuu. Pouvez-vous vérifier l'orthographe ?",
      "Bonjour ! Posez-moi une question sur un Pokémon.",
    ]) {
      expect(needsTool(reply)).toBe(false);
    }
  });

  test("first step without tool that cites data: asked again once with the reminder, then the tool is called", async () => {
    const { chat, received } = scripted(
      text("Pikachuu est de type Électrik avec 35 PV."), // from memory
      toolCall("get_pokemon", { name_or_id: "pikachuu" }),
      text("Je n'ai pas trouvé Pikachuu. Vérifiez l'orthographe."),
    );
    globalThis.fetch = (async () => new Response("Not Found", { status: 404 })) as unknown as typeof fetch;
    const response = await answer([user("Fiche de Pikachuu")], { chat });

    expect(received).toHaveLength(3);
    expect(received[1]!.at(-1)).toEqual({ role: "system", content: TOOL_REMINDER });
    expect(received[0]!.some((m) => m.content === TOOL_REMINDER)).toBe(false);
    expect(response.toolCalls.map((t) => t.name)).toEqual(["get_pokemon"]);
    expect(response.reply).toBe("Je n'ai pas trouvé Pikachuu. Vérifiez l'orthographe.");
  });

  test("still no tool after the reminder: the answer is never grounded, even without number or type", async () => {
    const { chat, received } = scripted(text("Pikachu évolue en Raichu."), text("Pikachu évolue en Raichu."));
    const response = await answer([user("Évolutions de Pikachu")], { chat });
    expect(received).toHaveLength(2);
    expect(response).toMatchObject({ toolCalls: [], grounded: false });
  });

  test("no retry when the first step calls a tool, or answers without any data (refusal)", async () => {
    const refusal = scripted(text("Je ne réponds qu'aux questions sur les Pokémon."));
    const refused = await answer([user("Recette de crêpes")], { chat: refusal.chat });
    expect(refusal.received).toHaveLength(1);
    expect(refused.grounded).toBe(true);

    const withTool = scripted(toolCall("get_pokemon", { name_or_id: "zorglub" }), text("Pikachu : introuvable."));
    globalThis.fetch = (async () => new Response("Not Found", { status: 404 })) as unknown as typeof fetch;
    await answer([user("Fiche de Zorglub")], { chat: withTool.chat });
    // Only the first step can be retried: the final answer after the tool (which cites Pikachu) is not.
    expect(withTool.received).toHaveLength(2);
    expect(withTool.received.flat().some((m) => m.content === TOOL_REMINDER)).toBe(false);
  });
});
