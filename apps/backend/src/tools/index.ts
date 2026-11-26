// Tool registry: the single place to declare which tools the agent can use.
// calculator and search_knowledge_base stay in examples.ts but are not exposed to the agent.

import type { Tool } from "./types";
import { toOllamaSpec } from "./types";
import { getEvolutionChain, getPokemon } from "./pokemon";
import { getTypeMatchups } from "./typeMatchups";
import { simulateBattleTool } from "./battle";

export const tools: Tool[] = [getPokemon, getTypeMatchups, getEvolutionChain, simulateBattleTool] as Tool[];

export const toolsByName = new Map(tools.map((t) => [t.name, t]));

export const toolSpecs = tools.map(toOllamaSpec);
