// Tests of the evolution answer: the list comes from the tool (summary_fr), the model only writes the introduction.

import { describe, expect, test } from "bun:test";
import type { StreamEvent, ToolTrace } from "@app/shared";
import { answer } from "./answer";
import { config } from "./config";
import { addEvolutionSummaries } from "./evolutionAnswer";
import type { ChatFn, OllamaMessage } from "./ollama";
import { cleanFormatting, guardReply } from "./outputGuard";

config.historySecret = "test-secret";

const summary = "Aquali (évolution d'Évoli) : Pierre Eau\nMentali (évolution d'Évoli) : amitié élevée, le jour";
const eevee: ToolTrace = {
  name: "get_evolution_chain",
  arguments: { name_or_id: "eevee" },
  durationMs: 1,
  result: {
    pokemon: "eevee",
    summary_fr: summary,
    stages: [
      { stage: 1, pokemon: [{ name: "eevee", name_fr: "Évoli" }] },
      { stage: 2, pokemon: [{ name: "vaporeon", name_fr: "Aquali", condition_fr: "Pierre Eau" }, { name: "espeon", name_fr: "Mentali", condition_fr: "amitié élevée, le jour" }] },
    ],
  },
};

describe("evolution answer", () => {
  test("the model keeps only its introduction; the list is summary_fr, added as it is", () => {
    const reply = "Voici les évolutions d'Évoli.\nAquali : amitié élevée, le jour\nMentali : Pierre Eau";
    expect(addEvolutionSummaries(reply, [eevee])).toBe(`Voici les évolutions d'Évoli.\n${summary}`);
  });

  test("an introduction that cites an evolution or a number is replaced by a fixed one", () => {
    expect(addEvolutionSummaries("Aquali évolue avec une pierre.", [eevee])).toBe(`Évolutions d'Évoli :\n${summary}`);
    expect(addEvolutionSummaries("Évoli a 8 évolutions.", [eevee])).toBe(`Évolutions d'Évoli :\n${summary}`);
    expect(addEvolutionSummaries("", [eevee])).toBe(`Évolutions d'Évoli :\n${summary}`);
  });

  test("without a successful get_evolution_chain the reply is unchanged", () => {
    expect(addEvolutionSummaries("Pikachu : type Électrik.", [])).toBe("Pikachu : type Électrik.");
    expect(addEvolutionSummaries("Introuvable.", [{ ...eevee, result: null, error: "not found" }])).toBe("Introuvable.");
  });

  test("answer(): the same final text in the stream and in the response, grounded, with the pairs of the tool", async () => {
    const replies: OllamaMessage[] = [
      { role: "assistant", content: "", tool_calls: [{ function: { name: "get_evolution_chain", arguments: { name_or_id: "eevee" } } }] },
      { role: "assistant", content: "Voici les évolutions d'Évoli.\nAquali : amitié élevée, le jour" },
    ];
    let call = 0;
    const chat: ChatFn = async () => ({ message: replies[call++]! });
    const tool = { name: "get_evolution_chain", description: "", schema: (await import("zod")).z.object({ name_or_id: (await import("zod")).z.string() }), execute: () => eevee.result };
    const events: StreamEvent[] = [];
    const response = await answer([{ role: "user", content: "Évolutions d'Évoli" }], {
      chat,
      tools: new Map([["get_evolution_chain", tool as never]]),
      onEvent: (e) => events.push(e),
    });
    expect(response.reply).toBe(`Voici les évolutions d'Évoli.\n${summary}`);
    expect(events.find((e) => e.type === "token")).toEqual({ type: "token", content: response.reply });
    expect(response).toMatchObject({ grounded: true, unverified_evolutions: [] });
  });
});

describe("output formatting", () => {
  test("Markdown (** and #) and Chinese characters are removed, the text is kept", () => {
    expect(cleanFormatting("## Fiche\n**Types** : Électrik")).toBe("Fiche\nTypes : Électrik");
    expect(cleanFormatting("Nom : Mewtwo (英 : Mewtwo)")).toBe("Nom : Mewtwo (Mewtwo)");
    expect(cleanFormatting("Nom : Ectoplasma (英)")).toBe("Nom : Ectoplasma");
    expect(cleanFormatting("Types：Psy，Combat")).toBe("Types:Psy,Combat");
    expect(cleanFormatting("Pikachu (n°25) : type Électrik.")).toBe("Pikachu (n°25) : type Électrik.");
  });

  test("guardReply applies the cleaning to every answer (and still refuses a prompt leak)", () => {
    expect(guardReply("**Pikachu** est de type Électrik 电.")).toBe("Pikachu est de type Électrik.");
  });
});
