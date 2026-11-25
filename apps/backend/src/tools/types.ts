import { z } from "zod";
import type { OllamaToolSpec } from "../ollama";

/**
 * A tool = a name, a description the LLM reads to decide when to call it,
 * a Zod schema (validates the arguments the LLM produces) and the function itself.
 */
export interface Tool<S extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  schema: S;
  execute: (args: z.infer<S>) => Promise<unknown> | unknown;
}

export function defineTool<S extends z.ZodObject>(tool: Tool<S>): Tool<S> {
  return tool;
}

/** Converts our tool definition to the format Ollama expects (JSON Schema). */
export function toOllamaSpec(tool: Tool): OllamaToolSpec {
  const { $schema: _ignored, ...parameters } = z.toJSONSchema(tool.schema) as Record<string, unknown>;
  return {
    type: "function",
    function: { name: tool.name, description: tool.description, parameters },
  };
}
