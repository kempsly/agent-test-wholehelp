// PokeAPI client: fixed base URL, validated names, timeout and in-memory cache.
// The model never provides a URL: it only provides a name or a number, validated here.

const BASE_URL = "https://pokeapi.co/api/v2";
const TIMEOUT_MS = 8_000;

/** Closed list of the resources we read. */
export type Resource = "pokemon" | "pokemon-species" | "type" | "evolution-chain";

export type PokeApiErrorKind = "invalid" | "not_found" | "unavailable";

/** Error with a clear message that can be sent back to the model as { error }. */
export class PokeApiError extends Error {
  constructor(
    readonly kind: PokeApiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "PokeApiError";
  }
}

const NAME_PATTERN = /^[a-z0-9-]{1,40}$/;

/**
 * Normalizes a Pokemon name or number: lowercase, spaces become hyphens.
 * Anything outside [a-z0-9-] (path, query string, accents, instructions) is rejected.
 */
export function normalizeName(input: string | number): string {
  const name = String(input).trim().toLowerCase().replace(/\s+/g, "-");
  if (!NAME_PATTERN.test(name) || name === "0") {
    throw new PokeApiError(
      "invalid",
      "Invalid name. Use the exact French or English name (40 characters max) or the Pokedex number.",
    );
  }
  return name;
}

const cache = new Map<string, unknown>();

export function clearCache(): void {
  cache.clear();
}

/** Fetches https://pokeapi.co/api/v2/{resource}/{name}. Only successful answers are cached. */
export async function fetchPokeApi(resource: Resource, nameOrId: string | number): Promise<unknown> {
  const name = normalizeName(nameOrId);
  const url = `${BASE_URL}/${resource}/${name}`;

  if (cache.has(url)) return cache.get(url);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new PokeApiError("unavailable", "PokeAPI unavailable (no answer within 8 seconds). Try again later.");
  }

  if (response.status === 404) {
    throw new PokeApiError(
      "not_found",
      `${resource} "${name}" not found. Ask the user for the French or English name or the Pokedex number.`,
    );
  }
  if (!response.ok) {
    throw new PokeApiError("unavailable", `PokeAPI unavailable (HTTP ${response.status}). Try again later.`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new PokeApiError("unavailable", "PokeAPI unavailable (invalid response). Try again later.");
  }

  cache.set(url, data);
  return data;
}
