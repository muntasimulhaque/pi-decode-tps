import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { TpsTracker } from "./engine.ts";
import { formatTps } from "./measure.ts";
import { formatReport } from "./report.ts";

const STATUS_KEY = "tps";

export default function piDecodeTps(pi: ExtensionAPI): void {
  const tracker = new TpsTracker();
  let lastStatusText: string | undefined;

  function canRender(ctx: ExtensionContext): boolean {
    return ctx.mode === "tui";
  }

  function setStatus(
    ctx: ExtensionContext | undefined,
    text: string | undefined,
  ): void {
    if (!ctx || !canRender(ctx)) return;
    if (text === lastStatusText) return;
    lastStatusText = text;
    ctx.ui.setStatus(STATUS_KEY, text);
  }

  function clearStatus(ctx: ExtensionContext | undefined): void {
    if (!ctx || !canRender(ctx)) return;
    lastStatusText = undefined;
    ctx.ui.setStatus(STATUS_KEY, undefined);
  }

  function renderShown(ctx: ExtensionContext): void {
    if (!canRender(ctx)) return;
    const shown = tracker.shown;
    if (shown) {
      setStatus(ctx, ctx.ui.theme.fg("dim", `⚡ ${formatTps(shown.tps)} t/s`));
    } else {
      clearStatus(ctx);
    }
  }

  pi.on("session_start", (_event, ctx) => {
    tracker.resetAll();
    clearStatus(ctx);
  });

  pi.on("before_agent_start", () => {
    tracker.resetTask();
  });

  pi.on("message_start", (event) => {
    if (event.message.role !== "assistant") return;
    tracker.beginMessage(event.message.timestamp);
  });

  pi.on("message_update", (event) => {
    if (event.message.role !== "assistant") return;

    const update = event.assistantMessageEvent;
    if (
      update.type !== "text_delta" &&
      update.type !== "thinking_delta" &&
      update.type !== "toolcall_delta"
    ) {
      return;
    }
    if (!update.delta) return;

    tracker.recordDelta(update.delta, Date.now());
  });

  pi.on("message_end", (event, ctx) => {
    if (event.message.role !== "assistant") return;

    const message = event.message;
    tracker.finishMessage({
      outputTokens: message.usage?.output ?? 0,
      stopReason: message.stopReason,
      durationMs: message.durationMs,
      now: Date.now(),
      model: message.model,
      provider: message.provider,
    });

    // Stable by default: update the footer once per completed response.
    // The previous exact value stays visible while the next one streams.
    renderShown(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    clearStatus(ctx);
    tracker.resetAll();
  });

  pi.registerCommand("tps", {
    description: "Show decode TPS details; use /tps reset to clear",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();

      if (arg === "reset") {
        tracker.resetAll();
        clearStatus(ctx);
        ctx.ui.notify("Decode TPS statistics reset.", "info");
        return;
      }

      if (arg !== "") {
        ctx.ui.notify("Usage: /tps or /tps reset", "info");
        return;
      }

      ctx.ui.notify(
        formatReport({
          last: tracker.last,
          shown: tracker.shown,
          task: tracker.task,
          session: tracker.session,
          liveTps: tracker.liveTps(Date.now()),
          streaming: tracker.isStreaming,
          estimatedStreamTokens: tracker.estimatedStreamTokens,
        }),
        "info",
      );
    },
  });
}
