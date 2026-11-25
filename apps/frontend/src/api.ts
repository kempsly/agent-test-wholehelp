import type { ChatMessage, StreamEvent } from "@app/shared";

/** Calls the streaming endpoint and forwards each Server-Sent Event to `onEvent`. */
export async function streamChat(messages: ChatMessage[], onEvent: (e: StreamEvent) => void, signal?: AbortSignal) {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`API error ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE events are separated by a blank line; each data line holds one JSON event.
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const data = part
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (data) onEvent(JSON.parse(data) as StreamEvent);
    }
  }
}

export async function fetchHealth() {
  const res = await fetch("/api/health");
  return (await res.json()) as { api: string; ollama: { ok: boolean; model: string; installed: boolean } };
}
