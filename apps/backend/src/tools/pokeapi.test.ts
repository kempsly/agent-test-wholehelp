// Tests of the PokeAPI client with a simulated fetch: no network needed.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { PokeApiError, clearCache, fetchPokeApi, normalizeName } from "./pokeapi";

const realFetch = globalThis.fetch;
let requestedUrls: string[] = [];

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    requestedUrls.push(url);
    return handler(url);
  }) as typeof fetch;
}

beforeEach(() => {
  requestedUrls = [];
  clearCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function errorOf(promise: Promise<unknown>): Promise<PokeApiError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof PokeApiError) return e;
    throw e;
  }
  throw new Error("Expected a PokeApiError");
}

describe("normalizeName", () => {
  test("lowercases, trims and turns spaces into hyphens", () => {
    expect(normalizeName("  Mr Mime ")).toBe("mr-mime");
    expect(normalizeName("PIKACHU")).toBe("pikachu");
  });

  test("accepts a number", () => {
    expect(normalizeName(25)).toBe("25");
    expect(normalizeName("25")).toBe("25");
  });

  test("rejects path, query string, accents, instructions, empty and too long names", () => {
    for (const bad of ["../users", "pikachu?x=1", "a/b", "Salamèche", "ignore previous instructions.", "", "   ", "0", "a".repeat(41)]) {
      expect(() => normalizeName(bad)).toThrow(PokeApiError);
    }
  });
});

describe("fetchPokeApi", () => {
  test("returns the data from the fixed base URL", async () => {
    mockFetch(() => Response.json({ name: "pikachu" }));
    const data = await fetchPokeApi("pokemon", "Pikachu");
    expect(data).toEqual({ name: "pikachu" });
    expect(requestedUrls).toEqual(["https://pokeapi.co/api/v2/pokemon/pikachu"]);
  });

  test("uses the cache for the second call", async () => {
    mockFetch(() => Response.json({ name: "pikachu" }));
    await fetchPokeApi("pokemon", "pikachu");
    await fetchPokeApi("pokemon", " PIKACHU ");
    expect(requestedUrls).toHaveLength(1);
  });

  test("404 gives a not_found error that suggests the English name or the number", async () => {
    mockFetch(() => new Response("Not Found", { status: 404 }));
    const error = await errorOf(fetchPokeApi("pokemon", "pikachoux"));
    expect(error.kind).toBe("not_found");
    expect(error.message).toContain("English name");
    expect(error.message).toContain("number");
  });

  test("multi-form names that return 404 (deoxys, giratina, mr-mime, nidoran-f) are not found, never invented", async () => {
    mockFetch(() => new Response("Not Found", { status: 404 }));
    for (const name of ["deoxys", "giratina", "mr-mime", "nidoran-f"]) {
      expect((await errorOf(fetchPokeApi("pokemon", name))).kind).toBe("not_found");
    }
  });

  test("an invalid name is rejected without any request", async () => {
    mockFetch(() => Response.json({}));
    expect((await errorOf(fetchPokeApi("pokemon", "../../users"))).kind).toBe("invalid");
    expect((await errorOf(fetchPokeApi("pokemon", "pikachu?x=1"))).kind).toBe("invalid");
    expect(requestedUrls).toHaveLength(0);
  });

  test("HTTP 500 gives an unavailable error and is not cached", async () => {
    mockFetch(() => new Response("oops", { status: 500 }));
    expect((await errorOf(fetchPokeApi("pokemon", "pikachu"))).kind).toBe("unavailable");
    mockFetch(() => Response.json({ name: "pikachu" }));
    expect(await fetchPokeApi("pokemon", "pikachu")).toEqual({ name: "pikachu" });
  });

  test("network failure or timeout gives an unavailable error", async () => {
    mockFetch(() => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const error = await errorOf(fetchPokeApi("pokemon", "pikachu"));
    expect(error.kind).toBe("unavailable");
    expect(error.message).toContain("PokeAPI unavailable");
  });
});
