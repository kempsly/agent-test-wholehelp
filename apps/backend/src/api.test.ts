// API limits, tested without the model: every request here is refused before the agent runs.

import { beforeEach, describe, expect, test } from "bun:test";
import { MAX_BODY_BYTES, RATE_LIMIT, app, rateLimiter } from "./index";
import { createRateLimiter } from "./rateLimit";
import { tools } from "./tools";

const post = (body: string, contentType?: string) =>
  app.request("/api/chat", { method: "POST", body, headers: contentType ? { "Content-Type": contentType } : {} });

beforeEach(() => rateLimiter.reset());

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
