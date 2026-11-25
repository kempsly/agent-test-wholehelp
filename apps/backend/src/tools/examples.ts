// Example tools. On test day: copy one of these, adapt it to the topic, add it to tools/index.ts.

import { z } from "zod";
import { defineTool } from "./types";
import { knowledgeBase } from "./knowledge";

export const getCurrentDateTime = defineTool({
  name: "get_current_datetime",
  description:
    "Returns the current date and time in a given IANA timezone. Use it whenever the user asks about today, now, dates or deadlines.",
  schema: z.object({
    timezone: z.string().default("Europe/Paris").describe("IANA timezone, e.g. Europe/Paris"),
  }),
  execute: ({ timezone }) => {
    const now = new Date();
    return {
      iso: now.toISOString(),
      local: now.toLocaleString("fr-FR", { timeZone: timezone }),
      weekday: now.toLocaleDateString("fr-FR", { weekday: "long", timeZone: timezone }),
      timezone,
    };
  },
});

export const calculator = defineTool({
  name: "calculator",
  description:
    "Evaluates an arithmetic expression (+, -, *, /, parentheses, decimals, %). Always use it for calculations instead of computing yourself.",
  schema: z.object({
    expression: z.string().min(1).describe("Arithmetic expression, e.g. (1200 * 0.2) + 35"),
  }),
  execute: ({ expression }) => ({ expression, result: evaluateArithmetic(expression) }),
});

export const searchKnowledgeBase = defineTool({
  name: "search_knowledge_base",
  description:
    "Searches the internal knowledge base (FAQ, procedures, product information) and returns the most relevant entries. Use it before answering any domain question; answer only from the returned entries.",
  schema: z.object({
    query: z.string().min(2).describe("What to look for, in natural language"),
    limit: z.number().int().min(1).max(5).default(3),
  }),
  execute: ({ query, limit }) => {
    const results = searchEntries(query, limit);
    return results.length ? results : { message: "No relevant entry found." };
  },
});

// ---------- helpers ----------

/** Simple keyword scoring (no vector DB needed for a 1h30 test; easy to swap for embeddings). */
function searchEntries(query: string, limit: number) {
  const terms = normalize(query).split(/\s+/).filter((t) => t.length > 2);
  return knowledgeBase
    .map((entry) => {
      const haystack = normalize(`${entry.title} ${entry.tags.join(" ")} ${entry.content}`);
      const score = terms.reduce((acc, t) => acc + (haystack.includes(t) ? 1 : 0), 0);
      return { ...entry, score };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...entry }) => entry);
}

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Safe arithmetic evaluator (recursive descent parser).
 * Never use eval()/new Function() on LLM output: it would allow code injection.
 */
export function evaluateArithmetic(input: string): number {
  const tokens = input.replace(/\s+/g, "").match(/\d+(?:\.\d+)?|[+\-*/%()]/g);
  if (!tokens || tokens.join("") !== input.replace(/\s+/g, "")) {
    throw new Error(`Invalid expression: ${input}`);
  }
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  const parseExpression = (): number => {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      value = next() === "+" ? value + parseTerm() : value - parseTerm();
    }
    return value;
  };
  const parseTerm = (): number => {
    let value = parseFactor();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = next();
      const right = parseFactor();
      if (op === "/" && right === 0) throw new Error("Division by zero");
      value = op === "*" ? value * right : op === "/" ? value / right : value % right;
    }
    return value;
  };
  const parseFactor = (): number => {
    const token = next();
    if (token === "-") return -parseFactor();
    if (token === "(") {
      const value = parseExpression();
      if (next() !== ")") throw new Error("Missing closing parenthesis");
      return value;
    }
    const n = Number(token);
    if (token === undefined || Number.isNaN(n)) throw new Error(`Unexpected token: ${token}`);
    return n;
  };

  const result = parseExpression();
  if (pos !== tokens.length) throw new Error(`Unexpected token: ${peek()}`);
  return Math.round(result * 1e10) / 1e10;
}
