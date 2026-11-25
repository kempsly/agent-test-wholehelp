// The agent loop: LLM decides -> we execute the requested tools -> results go back to the LLM
// -> repeat until the LLM answers without calling a tool (or we hit maxIterations).

import type { ChatMessage, ChatResponse, StreamEvent, ToolTrace } from "@app/shared";
import { config } from "./config";
import type { ChatFn, OllamaMessage, OllamaToolSpec } from "./ollama";
import { ollamaChat } from "./ollama";
import { buildSystemPrompt } from "./prompt";
import type { Tool } from "./tools/types";
import { toolsByName as defaultTools, toolSpecs as defaultSpecs } from "./tools";

export interface AgentOptions {
  chat?: ChatFn;
  tools?: Map<string, Tool>;
  specs?: OllamaToolSpec[];
  onEvent?: (event: StreamEvent) => void;
}

export async function runAgent(history: ChatMessage[], options: AgentOptions = {}): Promise<ChatResponse> {
  const chat = options.chat ?? ollamaChat;
  const tools = options.tools ?? defaultTools;
  const specs = options.specs ?? defaultSpecs;
  const emit = options.onEvent ?? (() => {});
  const started = performance.now();

  const messages: OllamaMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  const traces: ToolTrace[] = [];

  for (let iteration = 1; iteration <= config.maxIterations; iteration++) {
    const { message } = await chat(messages, specs);
    messages.push(message);

    const calls = message.tool_calls ?? [];
    if (calls.length === 0) {
      const reply = message.content.trim();
      emit({ type: "token", content: reply });
      return { reply, toolCalls: traces, model: config.model, iterations: iteration, durationMs: ms(started) };
    }

    // Independent tool calls from the same turn run in parallel.
    const results = await Promise.all(
      calls.map(async (call) => {
        const { name, arguments: args } = call.function;
        emit({ type: "tool_call", name, arguments: args });
        const trace = await executeTool(tools, name, args);
        emit({ type: "tool_result", trace });
        return trace;
      }),
    );

    for (const trace of results) {
      traces.push(trace);
      messages.push({
        role: "tool",
        tool_name: trace.name,
        // Errors are sent back to the model so it can correct its arguments or explain.
        content: JSON.stringify(trace.error ? { error: trace.error } : trace.result),
      });
    }
  }

  const reply = "Je n'ai pas pu finaliser la réponse (trop d'étapes). Pouvez-vous reformuler ou préciser la demande ?";
  emit({ type: "token", content: reply });
  return { reply, toolCalls: traces, model: config.model, iterations: config.maxIterations, durationMs: ms(started) };
}

async function executeTool(tools: Map<string, Tool>, name: string, rawArgs: unknown): Promise<ToolTrace> {
  const started = performance.now();
  const args = (typeof rawArgs === "string" ? safeJson(rawArgs) : rawArgs) as Record<string, unknown>;
  const tool = tools.get(name);

  if (!tool) {
    return { name, arguments: args, result: null, error: `Unknown tool "${name}"`, durationMs: ms(started) };
  }

  // Validate what the LLM produced before executing anything.
  const parsed = tool.schema.safeParse(args ?? {});
  if (!parsed.success) {
    const error = `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
    return { name, arguments: args, result: null, error, durationMs: ms(started) };
  }

  try {
    const result = await withTimeout(Promise.resolve(tool.execute(parsed.data)), config.toolTimeoutMs);
    return { name, arguments: parsed.data, result, durationMs: ms(started) };
  } catch (err) {
    return { name, arguments: parsed.data, result: null, error: (err as Error).message, durationMs: ms(started) };
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Tool timed out after ${timeoutMs} ms`)), timeoutMs)),
  ]);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

const ms = (start: number) => Math.round(performance.now() - start);
