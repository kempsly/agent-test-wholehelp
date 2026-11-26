// French Pokemon names: looked up in the table generated from PokeAPI (scripts/build-names.ts), never translated by the model.

import names from "../data/names-fr.json";
import { normalizeFrenchName } from "./normalizeFrench";

interface NameEntry {
  /** English name of the default Pokemon (deoxys-normal for deoxys). */
  en: string;
  /** French name as displayed, with accents and capitals (Évoli). */
  fr: string;
}

/** Normalized French name -> names (a Map: no inherited keys such as "constructor"). */
const BY_FRENCH = new Map<string, NameEntry>(Object.entries(names as Record<string, NameEntry>));

/** The same table the other way round: English name -> French name as displayed. */
const FRENCH_BY_ENGLISH = new Map<string, string>();
for (const { en, fr } of BY_FRENCH.values()) if (!FRENCH_BY_ENGLISH.has(en)) FRENCH_BY_ENGLISH.set(en, fr);

/**
 * French name of a Pokemon or of a species, as displayed (Évoli), or null.
 * The table holds the default form (wormadam-plant): a species name (wormadam) is found through its only form.
 */
export function frenchNameOf(english: string): string | null {
  const exact = FRENCH_BY_ENGLISH.get(english);
  if (exact) return exact;
  const forms = [...FRENCH_BY_ENGLISH].filter(([name]) => name.startsWith(`${english}-`));
  return forms.length === 1 ? forms[0]![1] : null;
}

/** English name if the input is a known French name (accents and case ignored), otherwise the input unchanged. */
export function resolvePokemonName(input: string): string {
  return BY_FRENCH.get(normalizeFrenchName(input))?.en ?? input;
}
