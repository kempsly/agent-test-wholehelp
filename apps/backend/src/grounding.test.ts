// Tests of the grounding check: numbers and type names of the answer must come from the tool results.

import { describe, expect, test } from "bun:test";
import type { ChatResponse, ToolTrace } from "@app/shared";
import { checkGrounding, withGrounding } from "./grounding";

const trace = (name: string, result: unknown, error?: string): ToolTrace => ({
  name,
  arguments: {},
  result: error ? null : result,
  error,
  durationMs: 1,
});

const pikachu = trace("get_pokemon", {
  id: 25,
  name: "pikachu",
  types: ["electric"],
  base_stats: { hp: 35, attack: 55, speed: 90 },
  height_m: 0.4,
  weight_kg: 6,
  description_fr: "Il possède 2 poches dans les joues.",
});

const dracaufeuMatchups = trace("get_type_matchups", {
  defender_types: ["fire", "flying"],
  attacking_types_by_multiplier: {
    x4: ["rock"],
    x2: ["water", "electric"],
    x1: ["normal", "ice", "poison", "flying", "psychic", "ghost", "dragon", "dark"],
    x0_5: ["fire", "fighting", "steel", "fairy"],
    x0_25: ["grass", "bug"],
    x0: ["ground"],
  },
});

describe("grounding check", () => {
  test("an answer built from the tool results is grounded", () => {
    const reply = "Nom : Pikachu\nTypes : Électrik\nStatistiques : PV 35, Attaque 55, Vitesse 90\nTaille et poids : 0,4 m, 6 kg\nNuméro : 25";
    expect(checkGrounding(reply, [pikachu])).toEqual({ grounded: true, unverified_numbers: [], unverified_types: [] });
  });

  test("an invented number is reported", () => {
    const result = checkGrounding("Pikachu a 99 PV et pèse 6 kg.", [pikachu]);
    expect(result.grounded).toBe(false);
    expect(result.unverified_numbers).toEqual(["99"]);
  });

  test("an invented type is reported (French or English name)", () => {
    expect(checkGrounding("Pikachu est de type Électrik et Eau.", [pikachu])).toMatchObject({
      grounded: false,
      unverified_types: ["water"],
    });
    expect(checkGrounding("Pikachu is a ghost.", [pikachu]).unverified_types).toEqual(["ghost"]);
  });

  test("multipliers and numbers up to 2 are tolerated", () => {
    const reply = "Roche : x4. Eau et Électrik : ×2. Plante et Insecte : x0,25. Sol : x0. Il a 2 types.";
    expect(checkGrounding(reply, [dracaufeuMatchups])).toMatchObject({ grounded: true, unverified_numbers: [] });
  });

  test("a decimal comma matches a decimal point in the results", () => {
    expect(checkGrounding("Taille : 0,4 m. Poids : 6,0 kg.", [pikachu]).unverified_numbers).toEqual([]);
  });

  test("a type cited in a word is not confused with a longer word (Dracaufeu is not Feu)", () => {
    expect(checkGrounding("Dracaufeu est un Pokémon.", []).unverified_types).toEqual([]);
  });

  test("answering about weaknesses without get_type_matchups is detected (types not returned by any tool)", () => {
    const onlyPokemonSheet = trace("get_pokemon", { name: "charizard", types: ["fire", "flying"] });
    const result = checkGrounding("Dracaufeu est faible contre les types Plante, Eau et Vol.", [onlyPokemonSheet]);
    expect(result.grounded).toBe(false);
    expect(result.unverified_types).toEqual(["water", "grass"]);
  });

  test("results of a failed tool call do not ground anything", () => {
    const failed = trace("get_pokemon", null, 'Pokemon "pikachoux" not found.');
    expect(checkGrounding("Pikachoux a 35 PV.", [failed]).unverified_numbers).toEqual(["35"]);
  });

  test("numbers without any tool call are not grounded", () => {
    expect(checkGrounding("Pikachu a 35 PV.", []).grounded).toBe(false);
  });

  test("withGrounding adds the fields to the agent response without changing it", () => {
    const response: ChatResponse = { reply: "Pikachu a 99 PV.", toolCalls: [pikachu], model: "m", iterations: 2, durationMs: 10 };
    expect(withGrounding(response)).toEqual({ ...response, grounded: false, unverified_numbers: ["99"], unverified_types: [] });
  });
});
