import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { TpsTracker } from "./engine.ts";
import { formatTps } from "./measure.ts";
import { formatReport } from "./report.ts";

const STATUS_KEY = "tps";
const TICK_MS = 250;

export default function piDecodeTps(pi: ExtensionAPI): void {
  const tracker = new TpsTracker();
  let ticker: ReturnType<typeof setInterval> | undefined;
  let tickerCtx: ExtensionContext | undefined;
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

  function stopTicker(): void {
    if (ticker) {
      clearInterval(ticker);
      ticker = undefined;
    }
    tickerCtx = undefined;
  }

  function renderLive(ctx: ExtensionContext, live: number): void {
    if (!canRender(ctx)) return;
    if (live > 0) {
      setStatus(ctx, ctx.ui.theme.fg("accent", `⚡ ${formatTps(live)} t/s`));
    } else {
      setStatus(ctx, ctx.ui.theme.fg("dim", "⚡ …"));
    }
  }

  function renderShown(ctx: ExtensionContext): void {
    const shown = tracker.shown;
    if (shown) {
      setStatus(ctx, ctx.ui.theme.fg("dim", `⚡ ${formatTps(shown.tps)} t/s`));
    } else {
      clearStatus(ctx);
    }
  }

  function startTicker(ctx: ExtensionContext): void {
    stopTicker();
    if (!canRender(ctx)) return;

    tickerCtx = ctx;
    ticker = setInterval(() => {
      if (!tickerCtx) return;
      renderLive(tickerCtx, tracker.liveTps(Date.now()));
    }, TICK_MS);
    ticker.unref?.();
  }

  pi.on("session_start", (_event, ctx) => {
    stopTicker();
    tracker.resetAll();
    clearStatus(ctx);
  });

  pi.on("before_agent_start", () => {
    tracker.resetTask();
  });

  pi.on("message_start", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    stopTicker();
    tracker.beginMessage(event.message.timestamp);
    tickerCtx = ctx;
  });

  pi.on("message_update", (event, ctx) => {
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

    const now = Date.now();
    tracker.recordDelta(update.delta, now);
    if (!tracker.isStreaming) return;

    if (!ticker) startTicker(ctx);
    renderLive(ctx, tracker.liveTps(now));
  });

  pi.on("message_end", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    stopTicker();

    const message = event.message;
    tracker.finishMessage({
      outputTokens: message.usage?.output ?? 0,
      stopReason: message.stopReason,
      durationMs: message.durationMs,
      now: Date.now(),
      model: message.model,
      provider: message.provider,
    });

    // The response may be too short to replace the footer value, or it may
    // have failed. In both cases, leave the last meaningful exact value in
    // place instead of freezing the live estimate.
    renderShown(ctx);
  });

  pi.on("agent_settled", (_event, ctx) => {
    // Safety net for an error path that ends a run without message_end:
    // never leave the live ticker running or the live number frozen in place.
    stopTicker();
    renderShown(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    stopTicker();
    clearStatus(ctx);
    tracker.resetAll();
  });

  pi.registerCommand("tps", {
    description:
      "Show decode TPS details (excludes TTFT and tool time); use /tps reset to clear",
    handler: async (args, ctx) => {
      if (args.trim() === "reset") {
        stopTicker();
        tracker.resetAll();
        clearStatus(ctx);
        ctx.ui.notify("Decode TPS statistics reset.", "info");
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
