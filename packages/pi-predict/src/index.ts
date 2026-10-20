import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { PredictionAdapter } from "./native-adapter.ts";
import { predict } from "./prediction.ts";
import { predictionSettings } from "./settings.ts";

function source(ctx: ExtensionContext): string | undefined {
  const entry = ctx.sessionManager
    .buildSessionProjection()
    .entries.findLast((item) => item.messages.some((message) => message.role !== "system"));
  const last = entry?.messages.findLast((message) => message.role !== "system");
  if (
    !entry ||
    last?.role !== "assistant" ||
    last.stopReason !== "stop" ||
    !last.content.some((part) => part.type === "text" && part.text.trim())
  )
    return undefined;
  return `${ctx.sessionManager.getSessionId()}:${entry.sourceEntry.id}`;
}

export default function piPredict(pi: ExtensionAPI): void {
  let adapter: PredictionAdapter | undefined;
  let settings: ReturnType<typeof predictionSettings> | undefined;
  let lifetime: AbortController | undefined;
  let request: AbortController | undefined;
  let unlisten: (() => void) | undefined;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let attempted: string | undefined;

  function invalidate(resetAttempt = false) {
    clearTimeout(scheduled);
    scheduled = undefined;
    request?.abort();
    request = undefined;
    adapter?.setSuggestion(undefined);
    if (resetAttempt) attempted = undefined;
  }
  function dispose() {
    invalidate(true);
    lifetime?.abort();
    lifetime = undefined;
    unlisten?.();
    unlisten = undefined;
    adapter?.dispose();
    adapter = undefined;
    settings = undefined;
  }
  async function attempt(ctx: ExtensionContext) {
    const display = adapter;
    const preferences = settings;
    if (!display?.ready || !preferences?.value.enabled) return;
    const key = source(ctx);
    if (!key || attempted === key) return;
    invalidate();
    attempted = key;
    const controller = new AbortController();
    request = controller;
    try {
      const suggestion = await predict(
        ctx,
        preferences.value,
        (signal) => display.prepare(signal),
        controller.signal,
      );
      if (
        request === controller &&
        !controller.signal.aborted &&
        source(ctx) === key &&
        ctx.isIdle()
      )
        display.setSuggestion(suggestion);
    } catch (error) {
      if (request === controller && !controller.signal.aborted)
        ctx.ui.notify(`Follow-up prediction failed: ${String(error)}`, "error");
    } finally {
      if (request === controller) request = undefined;
    }
  }
  function schedule(ctx: ExtensionContext) {
    clearTimeout(scheduled);
    scheduled = setTimeout(() => {
      scheduled = undefined;
      void attempt(ctx);
    }, 0);
  }

  pi.registerCommand("predict", {
    description: "Configure suggested follow-ups and their model",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/predict requires TUI mode.", "error");
        return;
      }
      if (!settings || !lifetime) {
        ctx.ui.notify(
          "Follow-up settings could not load. Correct pi-predict.json and run /reload.",
          "error",
        );
        return;
      }
      const scope = lifetime;
      await settings.show(ctx, scope.signal, () => invalidate(true));
      if (!scope.signal.aborted) schedule(ctx);
    },
  });
  pi.on("session_start", (_event, ctx) => {
    dispose();
    if (ctx.mode !== "tui") return;
    lifetime = new AbortController();
    try {
      settings = predictionSettings();
      adapter = new PredictionAdapter(ctx);
      unlisten = ctx.ui.onTerminalInput((data) => {
        if (adapter?.input(data)) return { consume: true };
        schedule(ctx);
        return undefined;
      });
      schedule(ctx);
    } catch (error) {
      ctx.ui.notify(`Could not start pi-predict: ${String(error)}`, "error");
    }
  });
  pi.on("agent_start", () => invalidate());
  pi.on("input", () => {
    invalidate();
  });
  pi.on("agent_settled", (event, ctx) => {
    if (event.aborted) {
      invalidate();
      attempted = source(ctx);
    } else schedule(ctx);
  });
  pi.on("model_select", (_event, ctx) => {
    invalidate(true);
    schedule(ctx);
  });
  pi.on("session_tree", (_event, ctx) => {
    invalidate(true);
    schedule(ctx);
  });
  pi.on("session_before_compact", () => invalidate());
  pi.on("session_compact", (_event, ctx) => {
    invalidate(true);
    adapter?.resetContext();
    schedule(ctx);
  });
  pi.on("ui_prompt_start", () => adapter?.prompt(true));
  pi.on("ui_prompt_end", (_event, ctx) => {
    adapter?.prompt(false);
    schedule(ctx);
  });
  pi.on("session_shutdown", dispose);
}
