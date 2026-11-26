import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ToolTrace } from "@app/shared";
import { fetchHealth, streamChat } from "./api";
import { BattleView } from "./BattleView";

interface UiMessage extends ChatMessage {
  toolCalls?: ToolTrace[];
  meta?: string;
  /** Result of the grounding check, only for answers of the agent. */
  grounded?: boolean;
  unverified?: string[];
  error?: boolean;
}

// On test day: adapt the title and the suggestions to the topic.
const TITLE = "Assistant Pokémon";
const SUGGESTIONS = ["Fiche de Pikachu", "Contre quoi le type feu est-il faible ?", "Compare Salamèche et Carapuce"];

function GroundingBadge({ grounded, unverified, usedTools }: { grounded: boolean; unverified: string[]; usedTools: boolean }) {
  if (!grounded) {
    return (
      <span className="badge warn" title={`Non retrouvé dans les outils : ${unverified.join(", ")}`}>
        à vérifier
      </span>
    );
  }
  return usedTools ? <span className="badge ok">vérifié</span> : null;
}

export function App() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [liveTools, setLiveTools] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("Connexion…");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchHealth()
      .then((h) =>
        setStatus(
          !h.ollama.ok ? "Ollama injoignable" : h.ollama.installed ? `Modèle : ${h.ollama.model}` : `Modèle ${h.ollama.model} non installé`,
        ),
      )
      .catch(() => setStatus("API injoignable"));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveTools]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const history: ChatMessage[] = [
      ...messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content })),
      { role: "user", content },
    ];
    setMessages((prev) => [...prev, { role: "user", content }]);
    setInput("");
    setLoading(true);
    setLiveTools([]);

    try {
      await streamChat(history, (event) => {
        if (event.type === "tool_call") setLiveTools((t) => [...t, event.name]);
        if (event.type === "done") {
          const r = event.response;
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: r.reply, toolCalls: r.toolCalls, grounded: r.grounded, unverified: [...r.unverified_numbers, ...r.unverified_types], meta: `${r.model} · ${r.iterations} étape(s) · ${(r.durationMs / 1000).toFixed(1)} s` },
          ]);
        }
        if (event.type === "error") {
          setMessages((prev) => [...prev, { role: "assistant", content: `Erreur : ${event.message}`, error: true }]);
        }
      });
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Erreur : ${(err as Error).message}`, error: true }]);
    } finally {
      setLoading(false);
      setLiveTools([]);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>{TITLE}</h1>
        <span className="status">{status}</span>
        {messages.length > 0 && (
          <button className="ghost" onClick={() => setMessages([])} disabled={loading}>
            Nouvelle conversation
          </button>
        )}
      </header>

      <main>
        {messages.length === 0 && (
          <div className="empty">
            <p>Posez une question à l'agent.</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role} ${m.error ? "error" : ""}`}>
            <div className="bubble">{m.content}</div>
            {m.toolCalls
              ?.filter((t) => t.name === "simulate_battle" && !t.error)
              .map((t, j) => <BattleView key={j} result={t.result} />)}
            {m.toolCalls && m.toolCalls.length > 0 && (
              <details className="tools">
                <summary>{m.toolCalls.length} appel(s) d'outil</summary>
                {m.toolCalls.map((t, j) => (
                  <div key={j} className="tool">
                    <strong>{t.name}</strong> <span className="muted">{t.durationMs} ms</span>
                    <pre>{JSON.stringify(t.arguments, null, 2)}</pre>
                    <pre className={t.error ? "err" : ""}>{t.error ?? JSON.stringify(t.result, null, 2)}</pre>
                  </div>
                ))}
              </details>
            )}
            {m.role === "assistant" && !m.error && m.grounded !== undefined && (
              // "verified" only if at least one tool was used; an answer without tool is never shown as verified.
              <GroundingBadge grounded={m.grounded} unverified={m.unverified ?? []} usedTools={(m.toolCalls?.length ?? 0) > 0} />
            )}
            {m.meta && <div className="meta">{m.meta}</div>}
          </div>
        ))}

        {loading && (
          <div className="msg assistant">
            <div className="bubble thinking">
              {liveTools.length ? `Utilise : ${liveTools.join(", ")}…` : "Réflexion…"}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Votre message…" disabled={loading} autoFocus />
        <button type="submit" disabled={loading || !input.trim()}>
          Envoyer
        </button>
      </form>
    </div>
  );
}
