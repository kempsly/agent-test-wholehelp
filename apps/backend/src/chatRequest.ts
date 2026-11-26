// Schema of the chat request. The front keeps the history, so the API must not trust it:
// only user and assistant roles, bounded number of messages and bounded sizes.

import { z } from "zod";
import type { ChatRequest } from "@app/shared";

export const MAX_MESSAGES = 30;
export const MAX_USER_CHARS = 1_000;
export const MAX_ASSISTANT_CHARS = 8_000;
export const MAX_TOTAL_CHARS = 20_000;

export const ChatRequestSchema = z
  .object({
    messages: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(MAX_ASSISTANT_CHARS) }))
      .min(1)
      .max(MAX_MESSAGES),
  })
  .superRefine(({ messages }, ctx) => {
    messages.forEach((m, i) => {
      if (m.role === "user" && m.content.length > MAX_USER_CHARS) {
        ctx.addIssue({ code: "custom", path: ["messages", i, "content"], message: `User message longer than ${MAX_USER_CHARS} characters` });
      }
    });
    const total = messages.reduce((sum, m) => sum + m.content.length, 0);
    if (total > MAX_TOTAL_CHARS) {
      ctx.addIssue({ code: "custom", path: ["messages"], message: `Conversation longer than ${MAX_TOTAL_CHARS} characters` });
    }
  }) satisfies z.ZodType<ChatRequest>;
