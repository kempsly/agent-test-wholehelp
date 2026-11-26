// Tests of the agent loop with a fake LLM: no Ollama needed, deterministic.

import { describe, expect, test } from "bun:test";
import { runAgent } from "./agent";
import type { ChatFn, OllamaMessage } from "./ollama";
import { calculator, evaluateArithmetic, getCurrentDateTime } from "./tools/examples";
import type { Tool } from "./tools/types";

/** The loop is tested with the example tools, independently of the tools exposed to the real agent. */
const exampleTools = new Map<string, Tool>([calculator, getCurrentDateTime].map((t) => [t.name, t as Tool]));

/** Fake LLM: returns the scripted messages one after the other. */
function scriptedChat(script: OllamaMessage[]): ChatFn & { calls: OllamaMessage[][] } {
  const calls: OllamaMessage[][] = [];
  const chat: ChatFn = async (messages) => {
    calls.push(structuredClone(messages));
    const message = script[calls.length - 1];
    if (!message) throw new Error("Script exhausted");
    return { message };
  };
  return Object.assign(chat, { calls });
}

describe("agent loop", () => {
  test("answers directly when no tool is needed", async () => {
    const chat = scriptedChat([{ role: "assistant", content: "Bonjour !" }]);
    const res = await runAgent([{ role: "user", content: "Salut" }], { chat, tools: exampleTools });
    expect(res.reply).toBe("Bonjour !");
    expect(res.toolCalls).toHaveLength(0);
    expect(res.iterations).toBe(1);
  });

  test("calls a tool, sends the result back, then answers", async () => {
    const chat = scriptedChat([
      { role: "assistant", content: "", tool_calls: [{ function: { name: "calculator", arguments: { expression: "1200 * 0.2" } } }] },
      { role: "assistant", content: "La TVA est de 240 €." },
    ]);
    const res = await runAgent([{ role: "user", content: "TVA sur 1200 € ?" }], { chat, tools: exampleTools });

    expect(res.reply).toBe("La TVA est de 240 €.");
    expect(res.toolCalls[0]).toMatchObject({ name: "calculator", result: { result: 240 } });
    const secondCall = chat.calls[1]!;
    expect(secondCall.at(-1)).toMatchObject({ role: "tool", tool_name: "calculator" });
  });

  test("returns validation errors to the model instead of crashing", async () => {
    const chat = scriptedChat([
      { role: "assistant", content: "", tool_calls: [{ function: { name: "calculator", arguments: {} } }] },
      { role: "assistant", content: "Pouvez-vous préciser le calcul ?" },
    ]);
    const res = await runAgent([{ role: "user", content: "Calcule" }], { chat, tools: exampleTools });
    expect(res.toolCalls[0]?.error).toContain("Invalid arguments");
    expect(res.reply).toBe("Pouvez-vous préciser le calcul ?");
  });

  test("handles unknown tools", async () => {
    const chat = scriptedChat([
      { role: "assistant", content: "", tool_calls: [{ function: { name: "hack_the_db", arguments: {} } }] },
      { role: "assistant", content: "Je ne peux pas faire ça." },
    ]);
    const res = await runAgent([{ role: "user", content: "x" }], { chat, tools: exampleTools });
    expect(res.toolCalls[0]?.error).toContain("Unknown tool");
  });

  test("stops after maxIterations", async () => {
    const loop: OllamaMessage = {
      role: "assistant",
      content: "",
      tool_calls: [{ function: { name: "get_current_datetime", arguments: {} } }],
    };
    const chat = scriptedChat(Array(10).fill(loop));
    const res = await runAgent([{ role: "user", content: "x" }], { chat, tools: exampleTools });
    expect(res.reply).toContain("trop d'étapes");
  });
});

describe("calculator", () => {
  test("evaluates with precedence and parentheses", () => {
    expect(evaluateArithmetic("2 + 3 * 4")).toBe(14);
    expect(evaluateArithmetic("(2 + 3) * 4")).toBe(20);
    expect(evaluateArithmetic("-5 + 10 / 4")).toBe(-2.5);
  });
  test("rejects code injection and invalid input", () => {
    expect(() => evaluateArithmetic("process.exit()")).toThrow();
    expect(() => evaluateArithmetic("1 / 0")).toThrow("Division by zero");
  });
});
