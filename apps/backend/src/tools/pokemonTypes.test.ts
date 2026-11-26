// Tests of the fixed table of the 18 types.

import { describe, expect, test } from "bun:test";
import { POKEMON_TYPES, TYPE_FR, typeFr } from "./pokemonTypes";

describe("type names table", () => {
  test("covers the 18 types with distinct French names", () => {
    expect(POKEMON_TYPES).toHaveLength(18);
    expect(Object.keys(TYPE_FR).sort()).toEqual([...POKEMON_TYPES].sort());
    expect(new Set(Object.values(TYPE_FR)).size).toBe(18);
  });

  test("official French names (ground is Sol, electric is Électrik); an unknown type is returned as is", () => {
    expect(typeFr("ground")).toBe("Sol");
    expect(typeFr("electric")).toBe("Électrik");
    expect(typeFr("fairy")).toBe("Fée");
    expect(typeFr("stellar")).toBe("stellar");
  });
});
