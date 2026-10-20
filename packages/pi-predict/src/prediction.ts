import type { Message } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { codexPrompt, predictionInstruction } from "./prompt.ts";
import type { PredictionSettings } from "./settings.ts";

export async function predict(
  ctx: ExtensionContext,
  settings: PredictionSettings,
  prepare: (signal: AbortSignal) => Promise<Message[]>,
  cancelled: AbortSignal,
): Promise<string | undefined> {
  const instruction = predictionInstruction();
  const model = settings.model
    ? ctx.modelRegistry.find(settings.model.provider, settings.model.id)
    : ctx.model;
  if (!model)
    throw new Error("The selected follow-up model is unavailable. Choose a model in /predict.");
  const signal = AbortSignal.any([cancelled, AbortSignal.timeout(30_000)]);
  const messages = await prepare(signal);
  signal.throwIfAborted();
  if (
    !model.input.includes("image") &&
    messages.some(
      (message) =>
        Array.isArray(message.content) && message.content.some((part) => part.type === "image"),
    )
  )
    throw new Error(
      "The follow-up model cannot receive the images in this conversation. Choose an image-capable model in /predict.",
    );

  const reasoning = codexPrompt.reasoning ?? ctx.thinkingLevel;
  const response = await ctx.modelRegistry
    .streamSimple(
      model,
      { messages: [...messages, { role: "user", content: instruction, timestamp: Date.now() }] },
      {
        signal,
        timeoutMs: 30_000,
        maxRetries: 0,
        toolChoice: "none",
        ...(reasoning && reasoning !== "off" ? { reasoning } : {}),
      },
    )
    .result();
  signal.throwIfAborted();
  if (response.stopReason !== "stop" || response.content.some((part) => part.type === "toolCall"))
    throw new Error(
      response.errorMessage ?? `Follow-up generation ended with ${response.stopReason}.`,
    );
  const text = response.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value) || !("suggestion" in value))
    throw new Error("The follow-up model did not return a suggestion object.");
  const suggestion = value.suggestion;
  if (suggestion === null) return undefined;
  if (typeof suggestion !== "string")
    throw new Error("The follow-up suggestion must be text or null.");
  // Model output is untrusted terminal input; allow prose whitespace, never control sequences.
  // oxlint-disable-next-line no-control-regex -- Reject control characters before they reach the terminal or draft.
  if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(suggestion))
    throw new Error("The follow-up suggestion contains terminal control characters.");
  return suggestion.trim() || undefined;
}
