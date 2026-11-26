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
  /** Context size asked to Ollama (its default here was 4 096: the system prompt and the tools were cut off). */
  numCtx: Number(process.env.LLM_NUM_CTX ?? 8192),
  /** Max tokens of one answer: stops a runaway generation (seen: 10 000 tokens, then HTTP 500 after 4 min). */
  numPredict: Number(process.env.LLM_NUM_PREDICT ?? 1024),
  /** Key of the HMAC that signs the assistant replies kept by the front (no default: required). */
  historySecret: process.env.HISTORY_SECRET ?? "",
};

/** The value .env.example used to give: public, so never accepted as a key. */
export const OLD_EXAMPLE_SECRET = "exemple-de-dev-a-remplacer-par-openssl-rand-hex-32";
export const MIN_SECRET_LENGTH = 32;

/** Why the HMAC key cannot be used, or null if it can. */
export function historySecretProblem(secret: string): string | null {
  const hint = "Generate one with: openssl rand -hex 32, then set HISTORY_SECRET in .env.";
  if (!secret) return `HISTORY_SECRET is missing. ${hint}`;
  if (secret === OLD_EXAMPLE_SECRET) return `HISTORY_SECRET is the public example value. ${hint}`;
  if (secret.length < MIN_SECRET_LENGTH) return `HISTORY_SECRET is shorter than ${MIN_SECRET_LENGTH} characters. ${hint}`;
  return null;
}

/** Called once when the server starts: stops it with a clear message if the key cannot be used. */
export function requireHistorySecret(secret: string = config.historySecret): void {
  const problem = historySecretProblem(secret);
  if (problem) {
    console.error(`Server not started: ${problem}`);
    process.exit(1);
  }
}
