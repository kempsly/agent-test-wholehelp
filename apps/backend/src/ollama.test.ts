// Test of the request sent to Ollama: context size and answer length are always set (fetch mocked).

import { afterEach, expect, test } from "bun:test";
import { config } from "./config";
import { ollamaChat } from "./ollama";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("every chat request asks for num_ctx 8192 and num_predict 1024, with the configured temperature", async () => {
  let body: { options?: Record<string, number> } = {};
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return Response.json({ message: { role: "assistant", content: "ok" } });
  }) as unknown as typeof fetch;
  await ollamaChat([{ role: "user", content: "Salut" }], []);
  expect(body.options).toEqual({ temperature: config.temperature, num_ctx: 8192, num_predict: 1024 });
});

test("returns the token counts given by Ollama (0 when absent)", async () => {
  globalThis.fetch = (async () =>
    Response.json({ message: { role: "assistant", content: "ok" }, prompt_eval_count: 2154, eval_count: 42 })) as unknown as typeof fetch;
  expect((await ollamaChat([{ role: "user", content: "Salut" }], [])).usage).toEqual({ prompt_eval_count: 2154, eval_count: 42 });
  globalThis.fetch = (async () => Response.json({ message: { role: "assistant", content: "ok" } })) as unknown as typeof fetch;
  expect((await ollamaChat([{ role: "user", content: "Salut" }], [])).usage).toEqual({ prompt_eval_count: 0, eval_count: 0 });
});
