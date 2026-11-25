// Tool registry: the single place to declare which tools the agent can use.

import type { Tool } from "./types";
import { toOllamaSpec } from "./types";
import { calculator, getCurrentDateTime, searchKnowledgeBase } from "./examples";

export const tools: Tool[] = [getCurrentDateTime, calculator, searchKnowledgeBase] as Tool[];

export const toolsByName = new Map(tools.map((t) => [t.name, t]));

export const toolSpecs = tools.map(toOllamaSpec);
