// Signature of the assistant replies (HMAC-SHA256 with HISTORY_SECRET). The front keeps the history, so an
// assistant message is accepted back only if the server signed it: a client cannot write fake assistant turns.
// The signature covers the reply AND the user message just before it: a signed reply cannot be replayed after
// another question (in another conversation or at another place).

import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config";

function requireSecret(secret: string): string {
  if (!secret) throw new Error("HISTORY_SECRET is missing: add it to .env (see .env.example).");
  return secret;
}

/** Hex HMAC-SHA256 of the question and its reply (JSON array: no ambiguity on where one ends). */
export function signReply(question: string, reply: string, secret: string = config.historySecret): string {
  return createHmac("sha256", requireSecret(secret)).update(JSON.stringify([question, reply]), "utf8").digest("hex");
}

/** True only if the signature matches this reply after this question. Without a configured secret, nothing is valid. */
export function isValidSignature(question: string, reply: string, signature: string | undefined, secret: string = config.historySecret): boolean {
  if (!secret || !signature || !/^[0-9a-f]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signReply(question, reply, secret), "hex"), Buffer.from(signature, "hex"));
}
