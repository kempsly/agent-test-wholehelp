// Types shared by the API and the web front, so both sides agree on the contract.

export type Role = "system" | "user" | "assistant" | "tool";

/** A message as exchanged between the front and the API. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Assistant messages only: HMAC given by the server with the reply, sent back unchanged. */
  signature?: string;
}

/** One tool call made by the agent during a turn, shown in the UI for transparency. */
export interface ToolTrace {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  error?: string;
  durationMs: number;
}

/** Number of previous exchanges (question + answer) given to the model with the new question. */
export const HISTORY_EXCHANGES = 2;

/**
 * The window of the history used for the model: the last message (the new question) and the HISTORY_EXCHANGES
 * complete exchanges before it (a user message followed by an assistant message). A question left without answer
 * (an error) is skipped. Used by the front (what it sends) and by the API (what the model sees), so both agree.
 */
export function recentHistory<M extends ChatMessage>(messages: M[], exchanges = HISTORY_EXCHANGES): M[] {
  const last = messages.at(-1);
  if (!last) return [];
  const kept: M[] = [last];
  let pairs = 0;
  for (let i = messages.length - 2; i >= 1 && pairs < exchanges; i--) {
    const answer = messages[i]!;
    const question = messages[i - 1]!;
    if (answer.role === "assistant" && question.role === "user") {
      kept.unshift(question, answer);
      pairs++;
      i--;
    }
  }
  return kept;
}

export interface ChatRequest {
  /** Full conversation history: the API is stateless, the front keeps the history. */
  messages: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
  toolCalls: ToolTrace[];
  model: string;
  iterations: number;
  durationMs: number;
}

/** Final response of the API: the agent response plus the result of the grounding check (heuristic). */
export interface GroundedChatResponse extends ChatResponse {
  /** false if the answer cites a number or a type that no tool returned during the turn. */
  grounded: boolean;
  unverified_numbers: string[];
  unverified_types: string[];
  /** Evolutions cited without their own condition (a condition put on another Pokemon). */
  unverified_evolutions: string[];
  /** Pokemon of a simulated battle that the question does not cite. */
  unverified_battle: string[];
}

/** Tokens of the turn, summed over all the model calls (tool steps and forced retry included). */
export interface TokenUsage {
  prompt_eval_count: number;
  eval_count: number;
}

/** What the API sends: the grounded response plus the signature of reply and the tokens used. */
export interface SignedChatResponse extends GroundedChatResponse {
  tokens: TokenUsage;
  /** HMAC-SHA256 of reply: the front stores it and sends it back with the message in the history. */
  signature: string;
}

/** Events sent over the streaming endpoint (Server-Sent Events). */
export type StreamEvent =
  | { type: "tool_call"; name: string; arguments: Record<string, unknown> }
  | { type: "tool_result"; trace: ToolTrace }
  | { type: "token"; content: string }
  | { type: "done"; response: SignedChatResponse }
  | { type: "error"; message: string };
