import type { ThinkingLevel } from "@earendil-works/pi-ai";

// Codex 26.1013.40934 fetches this text from GET /wham/predictions/config.
// Supplied as prediction-config.json on 2026-10-20; the hash covers the UTF-8 prompt text.
export const codexPrompt: {
  text: string | null;
  version: string | null;
  capturedAt: string | null;
  sha256: string | null;
  reasoning: ThinkingLevel | null;
} = {
  text: `This is an app-generated request for a suggested next user message. The user did not write this message.

Your suggestion will appear in the user's empty message composer. They can accept it, edit it, or ignore it; it will not be sent automatically.

Predict the single message this user is most likely to type next from the visible conversation. Use the whole conversation to understand their current intent and the latest exchange. Choose the action and specific object that best continue that intent, rather than a generally useful follow-up. Express its core naturally in the user's voice, keeping the requirements needed to retain its meaning. Choose the strongest grounded move even if several continuations are possible; uncertainty about exact wording or incidental details is not a reason to return null. Use null only when the conversation offers no grounded next move at all.

Set suggestion to exactly one natural user message, one line, at most 240 characters, or null. No alternatives or explanation.`,
  version: "5",
  capturedAt: "2026-10-20",
  sha256: "bf64e2c1b0e11dca1a982ab95e77afc4046422b3605849fb9d9da0fdca069418",
  reasoning: "high",
};

const responseSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: { suggestion: { anyOf: [{ type: "string" }, { type: "null" }] } },
  required: ["suggestion"],
  additionalProperties: false,
};

export function predictionInstruction(): string {
  if (!codexPrompt.text || !codexPrompt.version)
    throw new Error(
      "The verified Codex follow-up prompt has not been bundled in pi-predict/src/prompt.ts. Predictions are unavailable.",
    );
  return `${codexPrompt.text}\n\nReturn only JSON matching this schema: ${JSON.stringify(responseSchema)}.`;
}
