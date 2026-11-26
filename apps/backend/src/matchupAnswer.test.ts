// Tests of the code-written lists of weaknesses, resistances and immunities added to the answer.

import { describe, expect, test } from "bun:test";
import type { ToolTrace } from "@app/shared";
import { addMatchupSummaries } from "./matchupAnswer";

const summary = "Faiblesses : Sol (x2)\nRésistances : Insecte (x0,25)\nImmunités : Normal (x0), Combat (x0)\nLes autres types infligent des dégâts normaux (x1).";
const gengar: ToolTrace = {
  name: "get_type_matchups",
  arguments: { pokemon: "gengar" },
  result: { pokemon: "gengar", pokemon_fr: "Ectoplasma", defender_types: ["ghost", "poison"], defender_types_fr: ["Spectre", "Poison"], summary_fr: summary },
  durationMs: 1,
};

describe("addMatchupSummaries", () => {
  test("the model keeps its introduction (it may cite the defender's own types), the lists are added as written in code", () => {
    expect(addMatchupSummaries("Ectoplasma est de type Spectre et Poison. Il est faible au Psy (x2).", [gengar])).toBe(
      `Ectoplasma est de type Spectre et Poison.\n${summary}`,
    );
  });

  test("an introduction with a multiplier or an attacking type is replaced by a fixed one; no tool result, no change", () => {
    expect(addMatchupSummaries("Ectoplasma craint le Sol (x4).", [gengar])).toBe(`Faiblesses et résistances d'Ectoplasma (Spectre, Poison) :\n${summary}`);
    expect(addMatchupSummaries("Ectoplasma craint le Sol.", [{ ...gengar, result: null, error: "not found" }])).toBe("Ectoplasma craint le Sol.");
  });

  test("after a code-written evolution list, the lists are appended with their own introduction", () => {
    expect(addMatchupSummaries("Évolutions de Fantominus :\nSpectrum : niveau 25", [gengar], true)).toBe(
      `Évolutions de Fantominus :\nSpectrum : niveau 25\nFaiblesses et résistances d'Ectoplasma (Spectre, Poison) :\n${summary}`,
    );
  });
});
