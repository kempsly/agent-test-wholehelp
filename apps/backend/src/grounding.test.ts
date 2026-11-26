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

const entry = (type_fr: string, type_en: string, multiplicateur: number) => ({ type_fr, type_en, multiplicateur });

const dracaufeuMatchups = trace("get_type_matchups", {
  defender_types: ["fire", "flying"],
  defender_types_fr: ["Feu", "Vol"],
  faiblesses: [entry("Roche", "rock", 4), entry("Eau", "water", 2), entry("Électrik", "electric", 2)],
  resistances: [entry("Plante", "grass", 0.25), entry("Insecte", "bug", 0.25)],
  immunites: [entry("Sol", "ground", 0)],
});

describe("grounding check", () => {
  test("an answer built from the tool results is grounded", () => {
    const reply = "Nom : Pikachu\nTypes : Électrik\nStatistiques : PV 35, Attaque 55, Vitesse 90\nTaille et poids : 0,4 m, 6 kg\nNuméro : 25";
    expect(checkGrounding(reply, [pikachu])).toEqual({ grounded: true, unverified_numbers: [], unverified_types: [], unverified_evolutions: [] });
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

  test("a French type name from the tool results is grounded; a neutral type absent from the results is not", () => {
    expect(checkGrounding("Faible contre Roche (x4), Eau et Électrik. Immunisé contre Sol.", [dracaufeuMatchups]).grounded).toBe(true);
    expect(checkGrounding("Insecte et Plante : x0,25. Spectre : x1.", [dracaufeuMatchups]).unverified_types).toEqual(["ghost"]);
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

  test("a failed tool call grounds nothing but its own message: stats are not grounded, the error text is", () => {
    const failed = trace("get_pokemon", null, 'Pokemon "pikachoux" not found. Try a specific form such as deoxys-normal.');
    expect(checkGrounding("Pikachoux a 35 PV.", [failed]).unverified_numbers).toEqual(["35"]);
    // A legitimate "not found" answer that repeats the advice of the tool is grounded.
    expect(checkGrounding("Introuvable. Essayez une forme précise, par exemple deoxys-normal.", [failed]).grounded).toBe(true);
  });

  test("a hyphenated name is not a type mention (deoxys-normal, water-absorb)", () => {
    expect(checkGrounding("Essayez deoxys-normal ou vaporeon (water-absorb).", []).unverified_types).toEqual([]);
    expect(checkGrounding("Il est de type normal.", []).unverified_types).toEqual(["normal"]);
  });

  test("numbers without any tool call are not grounded", () => {
    expect(checkGrounding("Pikachu a 35 PV.", []).grounded).toBe(false);
  });

  test("withGrounding adds the fields to the agent response without changing it", () => {
    const response: ChatResponse = { reply: "Pikachu a 99 PV.", toolCalls: [pikachu], model: "m", iterations: 2, durationMs: 10 };
    expect(withGrounding(response)).toEqual({ ...response, grounded: false, unverified_numbers: ["99"], unverified_types: [], unverified_evolutions: [] });
  });

  // ---------- evolutions: each one with its own condition ----------

  const eevee = {
    name: "get_evolution_chain",
    arguments: {},
    durationMs: 1,
    result: {
      summary_fr: "Aquali (évolution d'Évoli) : Pierre Eau\nMentali (évolution d'Évoli) : amitié élevée, le jour",
      stages: [
        { stage: 1, pokemon: [{ name: "eevee", name_fr: "Évoli" }] },
        {
          stage: 2,
          pokemon: [
            { name: "vaporeon", name_fr: "Aquali", condition_fr: "Pierre Eau" },
            { name: "espeon", name_fr: "Mentali", condition_fr: "amitié élevée, le jour" },
          ],
        },
      ],
    },
  };

  test("pair check: a condition put on another evolution is flagged (Aquali : amitié élevée, le jour)", () => {
    expect(checkGrounding("Aquali : amitié élevée, le jour", [eevee])).toMatchObject({ grounded: false, unverified_evolutions: ["Aquali"] });
    expect(checkGrounding("Aquali : Pierre Eau\nMentali : Pierre Eau", [eevee]).unverified_evolutions).toEqual(["Mentali"]);
  });

  test("pair check: each evolution with its own condition is grounded, accents and case ignored; the base Pokemon is free", () => {
    const reply = "Évoli a plusieurs évolutions.\nAquali (évolution d'Évoli) : Pierre Eau\nmentali : AMITIE ELEVEE, LE JOUR";
    expect(checkGrounding(reply, [eevee])).toMatchObject({ grounded: true, unverified_evolutions: [] });
  });

  // ---------- battles (real answers of qwen2.5:7b, before the fix all flagged "à vérifier") ----------

  const battle = {
    name: "simulate_battle",
    arguments: {},
    durationMs: 1,
    result: {
      pokemon_a: "charizard",
      pokemon_b: "blastoise",
      winner: "blastoise",
      turns: 2,
      log: [
        { turn: 1, attacker: "charizard", defender: "blastoise", attack_type: "flying", attack_type_fr: "Vol", effectiveness: 1, damage: 16, defender_hp_left: 63 },
        { turn: 1, attacker: "blastoise", defender: "charizard", attack_type: "water", attack_type_fr: "Eau", effectiveness: 2, damage: 42, defender_hp_left: 36 },
        { turn: 2, attacker: "charizard", defender: "blastoise", attack_type: "flying", attack_type_fr: "Vol", effectiveness: 1, damage: 16, defender_hp_left: 47 },
        { turn: 2, attacker: "blastoise", defender: "charizard", attack_type: "water", attack_type_fr: "Eau", effectiveness: 2, damage: 42, defender_hp_left: 0 },
      ],
      initial_hp: [{ name: "charizard", hp: 78 }, { name: "blastoise", hp: 79 }],
      final_hp: [{ name: "charizard", hp: 0 }, { name: "blastoise", hp: 47 }],
    },
  };

  test("battle: the word combat is not the Fighting type, list numbers are not data, log numbers and start HP are grounded", () => {
    const reply =
      "Le Tortank gagne le combat. Voici un résumé du combat :\n1. Tour 1 : Dracaufeu attaque avec Vol, 16 dégâts, il reste 63 PV.\n" +
      "2. Tour 1 : Tortank attaque avec Eau (efficacité x2), 42 dégâts.\n3. Tour 2 : Dracaufeu attaque avec Vol, il reste 47 PV.\n" +
      "4. Tour 2 : Tortank inflige 42 dégâts.\nDracaufeu avait 78 PV au départ.";
    expect(checkGrounding(reply, [battle])).toEqual({ grounded: true, unverified_numbers: [], unverified_types: [], unverified_evolutions: [] });
  });

  test("battle: a real Fighting type mention is still checked, an invented number is still flagged", () => {
    expect(checkGrounding("Tortank est faible contre le type Combat.", [battle]).unverified_types).toEqual(["fighting"]);
    expect(checkGrounding("Faiblesses : Plante, Combat (x2)", [battle]).unverified_types).toEqual(["grass", "fighting"]);
    expect(checkGrounding("Tortank inflige 99 dégâts.", [battle]).unverified_numbers).toEqual(["99"]);
  });
});

