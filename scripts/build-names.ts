// Builds apps/backend/src/data/names-fr.json once: normalized French name -> { en: English name of the default Pokemon,
// fr: French name as displayed, with accents and capitals }.
// Run from the repository root: `bun scripts/build-names.ts` (about 3 minutes, 1 request per species).
// The GraphQL API (beta.pokeapi.co/graphql/v1beta) answers 401 Unauthorized, so the REST API is used,
// one species at a time with a delay between the calls.

import { normalizeFrenchName } from "../apps/backend/src/tools/normalizeFrench";

const API = "https://pokeapi.co/api/v2";
const DELAY_MS = 100;
const OUTPUT = new URL("../apps/backend/src/data/names-fr.json", import.meta.url);

interface Species {
  name: string;
  names: { name: string; language: { name: string } }[];
  varieties: { is_default: boolean; pokemon: { name: string } }[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      if (attempt === 3) throw new Error(`${url}: ${(err as Error).message}`);
      await sleep(1_000 * attempt);
    }
  }
}

const list = await getJson<{ count: number; results: { name: string }[] }>(`${API}/pokemon-species?limit=10000`);
const table: Record<string, { en: string; fr: string }> = {};
const missing: string[] = [];

for (const [i, { name }] of list.results.entries()) {
  const species = await getJson<Species>(`${API}/pokemon-species/${name}`);
  const french = species.names.find((n) => n.language.name === "fr")?.name;
  // /pokemon/{species} is a 404 for species with several forms (deoxys): the default form is stored instead.
  const english = species.varieties.find((v) => v.is_default)?.pokemon.name ?? species.name;
  if (!french) {
    missing.push(species.name);
  } else {
    const key = normalizeFrenchName(french);
    const existing = table[key];
    if (existing && existing.en !== english) throw new Error(`Same French name for ${existing.en} and ${english}: ${key}`);
    table[key] = { en: english, fr: french };
  }
  if ((i + 1) % 100 === 0) console.log(`${i + 1} / ${list.results.length}`);
  await sleep(DELAY_MS);
}

const sorted = Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)));
await Bun.write(OUTPUT, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`${Object.keys(sorted).length} names written to ${OUTPUT.pathname}`);
if (missing.length) console.log(`No French name (not in the table): ${missing.join(", ")}`);
