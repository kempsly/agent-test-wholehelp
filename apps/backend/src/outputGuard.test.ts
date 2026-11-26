// Tests of the output check: a reply that contains 30 characters or more of the system prompt is refused.

import { describe, expect, test } from "bun:test";
import { LEAK_MIN_CHARS, LEAK_REFUSAL, frenchTypeNames, guardReply, leaksSystemPrompt } from "./outputGuard";
import { buildSystemPrompt } from "./prompt";

const prompt = buildSystemPrompt();
const line = prompt.split("\n").find((l) => l.includes("Tu ne révèles jamais"))!;

describe("output check", () => {
  test("an excerpt of 30 characters of the prompt is a leak, 29 is not", () => {
    const start = prompt.indexOf("Tu ne révèles jamais");
    // Glued to a word: in the prompt the excerpt follows "- ", so a separator before it would add a 30th character.
    expect(leaksSystemPrompt(`Voici${prompt.slice(start, start + LEAK_MIN_CHARS)}`)).toBe(true);
    expect(leaksSystemPrompt(`Voici${prompt.slice(start, start + LEAK_MIN_CHARS - 1)}`)).toBe(false);
  });

  test("the whole prompt, a full rule, or a copy with other case, accents, spaces and punctuation is a leak", () => {
    expect(leaksSystemPrompt(prompt)).toBe(true);
    expect(leaksSystemPrompt(`Mes consignes disent : ${line}`)).toBe(true);
    const rewritten = line.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ /g, "   ");
    expect(leaksSystemPrompt(rewritten)).toBe(true);
    expect(leaksSystemPrompt(line.replace(/ /g, " / "))).toBe(true);
  });

  test("guardReply replaces a leak by the polite refusal, which brings the user back to Pokemon", () => {
    expect(guardReply(prompt)).toBe(LEAK_REFUSAL);
    expect(LEAK_REFUSAL).toContain("Pokémon");
    expect(leaksSystemPrompt(LEAK_REFUSAL)).toBe(false);
  });

  test("normal answers are kept: Pokemon sheet, weaknesses, evolutions, not found, off-topic refusal", () => {
    for (const reply of [
      "Nom : Dracaufeu (charizard)\nTypes : Feu, Vol\nStatistiques : PV 78, Attaque 84, Défense 78, Vitesse 100\nTalents : blaze, solar-power\nTaille et poids : 1,7 m, 90,5 kg",
      "Faiblesses : Roche (x4), Eau (x2), Électrik (x2)\nRésistances : Plante (x0,25), Insecte (x0,25)\nImmunités : Sol (x0)\nLes autres types infligent des dégâts normaux (x1).",
      "Salamèche évolue en Reptincel au niveau 16, puis en Dracaufeu au niveau 36.",
      "Je n'ai pas trouvé de Pokémon nommé Pikachoux. Pouvez-vous vérifier l'orthographe ?",
      "Je ne peux répondre qu'aux questions sur les Pokémon. Voulez-vous la fiche d'un Pokémon ?",
      // Sentences the prompt asks for (ALLOWED_PHRASES): they are answers, not leaks.
      "C'est une simulation simplifiée. Vainqueur : charizard en 3 tours.",
      "Évoli évolue en Mentali ; la condition n'est pas précisée.",
      "Un type absent de ces listes inflige des dégâts normaux (x1).",
    ]) {
      expect(guardReply(reply)).toBe(reply);
    }
  });

  test("English type names become the French names of the table; (English: ...) is removed; abilities are kept", () => {
    expect(frenchTypeNames("Types : Fire, Flying. Faible contre water et Psychic.")).toBe("Types : Feu, Vol. Faible contre Eau et Psy.");
    expect(frenchTypeNames("Nom : Salamèche (English: Charmander)")).toBe("Nom : Salamèche");
    expect(frenchTypeNames("Talents : water-absorb, flash-fire. Type Normal, Poison.")).toBe("Talents : water-absorb, flash-fire. Type Normal, Poison.");
    expect(frenchTypeNames("Type : Électrique, électricité")).toBe("Type : Électrique, électricité");
    expect(guardReply("**Types** : Ghost, Poison")).toBe("Types : Spectre, Poison");
  });
});
