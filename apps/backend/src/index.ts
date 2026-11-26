import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { streamSSE } from "hono/streaming";
import { answer } from "./answer";
import { ChatRequestSchema } from "./chatRequest";
import { config } from "./config";
import { ollamaHealth } from "./ollama";
import { tools } from "./tools";

export const app = new Hono();

app.use("*", logger());
app.use("/api/*", cors({ origin: ["http://localhost:5173"] }));

app.get("/api/health", async (c) => c.json({ api: "ok", ollama: await ollamaHealth() }));

app.get("/api/tools", (c) => c.json(tools.map((t) => ({ name: t.name, description: t.description }))));

// Simple request/response endpoint (handy for curl and tests).
app.post("/api/chat", async (c) => {
  const parsed = ChatRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid request", details: parsed.error.issues }, 400);
  try {
    return c.json(await answer(parsed.data.messages));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
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
      await send({ type: "error", message: (err as Error).message });
    }
  });
});

console.log(`API on http://localhost:${config.port} — model ${config.model} via ${config.ollamaUrl}`);

export default { port: config.port, fetch: app.fetch, idleTimeout: 120 };
