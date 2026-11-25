// Types shared by the API and the web front, so both sides agree on the contract.

export type Role = "system" | "user" | "assistant" | "tool";

/** A message as exchanged between the front and the API. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** One tool call made by the agent during a turn, shown in the UI for transparency. */
export interface ToolTrace {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  error?: string;
  durationMs: number;
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

/** Events sent over the streaming endpoint (Server-Sent Events). */
export type StreamEvent =
  | { type: "tool_call"; name: string; arguments: Record<string, unknown> }
  | { type: "tool_result"; trace: ToolTrace }
  | { type: "token"; content: string }
  | { type: "done"; response: ChatResponse }
  | { type: "error"; message: string };
