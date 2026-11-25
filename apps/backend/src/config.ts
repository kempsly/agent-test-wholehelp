// Central configuration, read once from environment variables (Bun loads .env automatically).

export const config = {
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  model: process.env.OLLAMA_MODEL ?? "qwen2.5:7b",
  port: Number(process.env.API_PORT ?? 3001),
  /** Max agent loop iterations (LLM call -> tools -> LLM call ...) to avoid infinite loops. */
  maxIterations: Number(process.env.AGENT_MAX_ITERATIONS ?? 6),
  /** Max time for a single tool execution. */
  toolTimeoutMs: Number(process.env.TOOL_TIMEOUT_MS ?? 10_000),
  /** Low temperature: we want reliable tool calls, not creativity. */
  temperature: Number(process.env.LLM_TEMPERATURE ?? 0.2),
};
