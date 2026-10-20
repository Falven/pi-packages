import type { ThinkingLevel } from "@earendil-works/pi-ai";

// Codex 26.1013.40934 fetches this text from GET /wham/predictions/config.
// Capture the real response before release; the app contains no bundled prompt.
export const codexPrompt: {
  text: string | null;
  version: string | null;
  capturedAt: string | null;
  sha256: string | null;
  reasoning: ThinkingLevel | null;
} = {
  text: null,
  version: null,
  capturedAt: null,
  sha256: null,
  reasoning: null,
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
