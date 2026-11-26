// Minimal Ollama client for the /api/chat endpoint (no SDK: easy to explain and to swap).
// Docs: https://github.com/ollama/ollama/blob/main/docs/api.md#chat-request-with-tools

import { config } from "./config";

export interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
  /** For role "tool": which tool produced this result. */
  tool_name?: string;
}

export interface OllamaToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatResult {
  message: OllamaMessage;
  /** Tokens read (prompt) and written (answer) by the model for this call, as given by Ollama. */
  usage?: { prompt_eval_count: number; eval_count: number };
}

/** The signature the agent depends on: makes it trivial to fake the LLM in tests. */
export type ChatFn = (messages: OllamaMessage[], tools: OllamaToolSpec[]) => Promise<ChatResult>;

export const ollamaChat: ChatFn = async (messages, tools) => {
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages,
      tools: tools.length ? tools : undefined,
      stream: false,
      options: { temperature: config.temperature, num_ctx: config.numCtx, num_predict: config.numPredict },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { message: OllamaMessage; prompt_eval_count?: number; eval_count?: number };
  return { message: data.message, usage: { prompt_eval_count: data.prompt_eval_count ?? 0, eval_count: data.eval_count ?? 0 } };
};

/** Used by /health: checks that Ollama is up and the configured model is installed. */
export async function ollamaHealth(): Promise<{ ok: boolean; model: string; installed: boolean; error?: string }> {
  try {
    const res = await fetch(`${config.ollamaUrl}/api/tags`);
    const data = (await res.json()) as { models: { name: string }[] };
    const installed = data.models.some((m) => m.name === config.model || m.name.startsWith(`${config.model}:`));
    return { ok: true, model: config.model, installed };
  } catch (err) {
    return { ok: false, model: config.model, installed: false, error: String(err) };
  }
}
