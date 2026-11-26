// Signature of the assistant replies (HMAC-SHA256 with HISTORY_SECRET). The front keeps the history, so an
// assistant message is accepted back only if the server signed it: a client cannot write fake assistant turns.

import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config";

function requireSecret(secret: string): string {
  if (!secret) throw new Error("HISTORY_SECRET is missing: add it to .env (see .env.example).");
  return secret;
}

/** Hex HMAC-SHA256 of the reply content. */
export function signReply(content: string, secret: string = config.historySecret): string {
  return createHmac("sha256", requireSecret(secret)).update(content, "utf8").digest("hex");
}

/** True only if the signature matches the content. Without a configured secret, nothing is valid. */
export function isValidSignature(content: string, signature: string | undefined, secret: string = config.historySecret): boolean {
  if (!secret || !signature || !/^[0-9a-f]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signReply(content, secret), "hex"), Buffer.from(signature, "hex"));
}
