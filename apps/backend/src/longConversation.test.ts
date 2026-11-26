// A long conversation must never break: what the front sends (the window of the last exchanges) always passes the
// request schema, whatever the length of the conversation, and the API never returns a reply it would refuse later.

import { describe, expect, test } from "bun:test";
import { recentHistory, type ChatMessage } from "@app/shared";
import { answer } from "./answer";
import { ChatRequestSchema, MAX_ASSISTANT_CHARS } from "./chatRequest";
import { config } from "./config";
import { signReply } from "./history";
import type { ChatFn } from "./ollama";

config.historySecret = "test-secret";

/** What App.tsx keeps after n questions: every question and its signed answer (answers of the given length). */
function conversation(n: number, answerLength: number): ChatMessage[] {
  return Array.from({ length: n }, (_, i) => {
    const content = `Réponse ${i + 1} `.padEnd(answerLength, "x");
    return [{ role: "user" as const, content: `Question ${i + 1}` }, { role: "assistant" as const, content, signature: signReply(content) }];
  }).flat();
}

const next = (history: ChatMessage[]): ChatMessage[] => [...history, { role: "user", content: "Question suivante" }];

describe("long conversation", () => {
  test("the cause of the 400: the whole history breaks the limits (31 messages at question 16, 20 000 characters)", () => {
    const issues = (history: ChatMessage[]) => ChatRequestSchema.safeParse({ messages: history }).error?.issues.map((i) => i.message) ?? [];
    expect(issues(next(conversation(14, 300)))).toEqual([]); // question 15: 29 messages
    expect(next(conversation(15, 300))).toHaveLength(31); // question 16
    expect(issues(next(conversation(15, 300)))).toEqual(["Too big: expected array to have <=30 items"]);
    expect(issues(next(conversation(14, 1500)))).toEqual(["Conversation longer than 20000 characters"]); // long answers
  });

  test("what the front sends now passes at any length, even with answers of the maximum size", () => {
    for (const [n, length] of [[15, 300], [50, 1500], [100, MAX_ASSISTANT_CHARS]] as const) {
      const sent = recentHistory(next(conversation(n, length)));
      expect(sent).toHaveLength(5);
      expect(ChatRequestSchema.safeParse({ messages: sent }).success).toBe(true);
    }
  });

  test("a runaway reply longer than an assistant message may be is cut before the signature: the next request passes", async () => {
    const chat: ChatFn = async () => ({ message: { role: "assistant", content: "Je ne réponds qu'aux questions sur les Pokémon. ".repeat(500) } });
    const response = await answer([{ role: "user", content: "Bonjour" }], { chat });
    expect(response.reply.length).toBe(MAX_ASSISTANT_CHARS);
    const history = recentHistory([{ role: "user", content: "Bonjour" }, { role: "assistant", content: response.reply, signature: response.signature }, { role: "user", content: "Fiche de Pikachu" }]);
    expect(ChatRequestSchema.safeParse({ messages: history }).success).toBe(true);
  });
});
