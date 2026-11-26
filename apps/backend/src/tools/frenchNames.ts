// French Pokemon names: looked up in the table generated from PokeAPI (scripts/build-names.ts), never translated by the model.

import names from "../data/names-fr.json";
import { normalizeFrenchName } from "./normalizeFrench";

/** Normalized French name -> English name of the default Pokemon (a Map: no inherited keys such as "constructor"). */
const FRENCH_TO_ENGLISH = new Map<string, string>(Object.entries(names));

/** English name if the input is a known French name (accents and case ignored), otherwise the input unchanged. */
export function resolvePokemonName(input: string): string {
  return FRENCH_TO_ENGLISH.get(normalizeFrenchName(input)) ?? input;
}
