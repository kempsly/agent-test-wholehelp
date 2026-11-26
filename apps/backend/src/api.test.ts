// API limits, tested without the model: every request here is refused before the agent runs.

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { MAX_BODY_BYTES, RATE_LIMIT, SERVICE_UNAVAILABLE, app, rateLimiter } from "./index";
import { createRateLimiter } from "./rateLimit";
import { tools } from "./tools";

const post = (body: string, contentType?: string) =>
  app.request("/api/chat", { method: "POST", body, headers: contentType ? { "Content-Type": contentType } : {} });

beforeEach(() => rateLimiter.reset());

// No real Ollama in these tests: fetch is replaced when a route would reach it.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
const fakeFetch = (body: string, status: number) => {
  globalThis.fetch = (async () => new Response(body, { status })) as unknown as typeof fetch;
};

describe("API limits", () => {
  test("refuses a body that is not declared as JSON (415)", async () => {
    expect((await post('{"messages":[]}', "text/plain")).status).toBe(415);
    expect((await post('{"messages":[]}')).status).toBe(415);
  });

  test("accepts application/json with a charset (then validates the body: 400)", async () => {
    expect((await post('{"messages":[]}', "application/json; charset=utf-8")).status).toBe(400);
  });

  test("refuses a body larger than 32 KB (413)", async () => {
    const big = JSON.stringify({ messages: [{ role: "user", content: "a".repeat(MAX_BODY_BYTES) }] });
    expect((await post(big, "application/json")).status).toBe(413);
  });

  test("refuses the 21st request of the minute from the same IP (429)", async () => {
    for (let i = 0; i < RATE_LIMIT.requests; i++) expect((await post("{}", "text/plain")).status).toBe(415);
    expect((await post("{}", "text/plain")).status).toBe(429);
  });

  test("/api/health is not rate limited: 30 calls, no 429", async () => {
    fakeFetch(JSON.stringify({ models: [] }), 200);
    for (let i = 0; i < 30; i++) expect((await app.request("/api/health")).status).toBe(200);
  });

  test("an Ollama error stays in the server logs: the client gets no URL and no text of Ollama", async () => {
    const ollamaText = "model runner crashed at http://localhost:11434/internal/runner";
    fakeFetch(ollamaText, 500);
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const body = JSON.stringify({ messages: [{ role: "user", content: "Fiche de Pikachu" }] });
      const headers = { "Content-Type": "application/json" };
      const chat = await app.request("/api/chat", { method: "POST", body, headers });
      const stream = await app.request("/api/chat/stream", { method: "POST", body, headers });
      const chatText = await chat.text();
      const streamText = await stream.text();

      expect(chat.status).toBe(502);
      expect(JSON.parse(chatText)).toEqual({ error: SERVICE_UNAVAILABLE });
      expect(streamText).toContain(JSON.stringify({ type: "error", message: SERVICE_UNAVAILABLE }));
      for (const text of [chatText, streamText]) {
        expect(text).not.toMatch(/https?:|11434|ollama|runner/i);
      }
      expect(String(logged.mock.calls.flat().join(" "))).toContain(ollamaText);
    } finally {
      logged.mockRestore();
    }
  });

  test("get_current_datetime is no longer exposed", () => {
    expect(tools.map((t) => t.name)).not.toContain("get_current_datetime");
  });
});

describe("createRateLimiter", () => {
  test("counts per key and opens a new window after windowMs", () => {
    let time = 0;
    const limiter = createRateLimiter(2, 1000, () => time);
    expect([limiter.allow("a"), limiter.allow("a"), limiter.allow("a")]).toEqual([true, true, false]);
    expect(limiter.allow("b")).toBe(true);
    time = 1000;
    expect(limiter.allow("a")).toBe(true);
  });
});
