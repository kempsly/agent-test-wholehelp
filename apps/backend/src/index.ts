import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getConnInfo } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { streamSSE } from "hono/streaming";
import { answer } from "./answer";
import { ChatRequestSchema } from "./chatRequest";
import { config, requireHistorySecret } from "./config";
import { ollamaHealth } from "./ollama";
import { createRateLimiter } from "./rateLimit";
import { tools } from "./tools";

export const app = new Hono();

app.use("*", logger());
app.use("/api/*", cors({ origin: ["http://localhost:5173"] }));

export const MAX_BODY_BYTES = 32 * 1024;
export const RATE_LIMIT = { requests: 20, windowMs: 60_000 };
/** The only error text the client gets; the details stay in the server logs. */
export const SERVICE_UNAVAILABLE = "Service momentanément indisponible";
export const rateLimiter = createRateLimiter(RATE_LIMIT.requests, RATE_LIMIT.windowMs);

/** Client IP from the Bun server; "unknown" when there is none (app.request in the tests). */
function clientIp(c: Parameters<typeof getConnInfo>[0]): string {
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

// Rate limit per IP (in memory) on the chat routes only (the ones that call the model; /api/health is polled by the
// front), then JSON only, then body size: checked before reading the body or calling the model.
const limitRate: MiddlewareHandler = async (c, next) => {
  if (!rateLimiter.allow(clientIp(c))) return c.json({ error: "Too many requests: 20 per minute maximum" }, 429);
  await next();
};
app.use("/api/chat", limitRate);
app.use("/api/chat/stream", limitRate);
app.use("/api/*", async (c, next) => {
  if (c.req.method === "POST" && !/^application\/json(\s*;|$)/i.test(c.req.header("Content-Type") ?? "")) {
    return c.json({ error: "Content-Type must be application/json" }, 415);
  }
  await next();
});
app.use("/api/*", bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "Request body too large (32 KB maximum)" }, 413) }));

app.get("/api/health", async (c) => c.json({ api: "ok", ollama: await ollamaHealth() }));

app.get("/api/tools", (c) => c.json(tools.map((t) => ({ name: t.name, description: t.description }))));

// Simple request/response endpoint (handy for curl and tests).
app.post("/api/chat", async (c) => {
  const parsed = ChatRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid request", details: parsed.error.issues }, 400);
  try {
    return c.json(await answer(parsed.data.messages));
  } catch (err) {
    console.error("[/api/chat]", err);
    return c.json({ error: SERVICE_UNAVAILABLE }, 502);
  }
});

// Streaming endpoint used by the front: shows tool calls live, then the final answer.
app.post("/api/chat/stream", async (c) => {
  const parsed = ChatRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid request", details: parsed.error.issues }, 400);

  return streamSSE(c, async (stream) => {
    const send = (event: object) => stream.writeSSE({ data: JSON.stringify(event) });
    try {
      const response = await answer(parsed.data.messages, { onEvent: (e) => void send(e) });
      await send({ type: "done", response });
    } catch (err) {
      console.error("[/api/chat/stream]", err);
      await send({ type: "error", message: SERVICE_UNAVAILABLE });
    }
  });
});

// Only when the server is started (bun src/index.ts), not when the tests import the app.
if (import.meta.main) requireHistorySecret();

console.log(`API on http://localhost:${config.port} — model ${config.model} via ${config.ollamaUrl}`);

export default { port: config.port, fetch: app.fetch, idleTimeout: 120 };
