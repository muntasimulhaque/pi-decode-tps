/**
 * Pure measurement helpers for pi-decode-tps.
 *
 * Decode TPS is intentionally decode-only: the timer starts at the first
 * non-empty streamed delta and stops at the end of the assistant message.
 * Prompt prefill, TTFT, queueing, and tool execution are not included.
 */

export const WINDOW_MS = 1_000;
export const MIN_SPAN_MS = 100;
const COMPACTION_THRESHOLD = 5_000;

export const MIN_DISPLAY_OUTPUT_TOKENS = 20;
export const MIN_DISPLAY_DECODE_MS = 300;

export interface WindowEvent {
  time: number;
  tokens: number;
}

/**
 * Time-based sliding window of token counts.
 *
 * `tps(now)` sums events from the last `windowMs` and divides by the actual
 * span. If a provider flushes a burst at one timestamp after a stall, the span
 * is extended to the previous event so the burst does not look infinitely fast.
 */
export class SlidingWindow {
  private events: WindowEvent[] = [];
  private startIndex = 0;
  private readonly windowMs: number;

  constructor(windowMs = WINDOW_MS) {
    this.windowMs = windowMs;
  }

  record(tokens: number, time: number): void {
    if (!Number.isFinite(tokens) || tokens <= 0) return;
    this.events.push({ time, tokens });
    if (this.startIndex >= COMPACTION_THRESHOLD) {
      this.events.splice(0, this.startIndex);
      this.startIndex = 0;
    }
  }

  tps(now: number): number {
    if (this.events.length === 0) return 0;

    const windowStart = now - this.windowMs;
    while (
      this.startIndex < this.events.length &&
      this.events[this.startIndex]!.time < windowStart
    ) {
      this.startIndex += 1;
    }
    if (this.startIndex >= this.events.length) return 0;

    let tokens = 0;
    for (let index = this.startIndex; index < this.events.length; index += 1) {
      tokens += this.events[index]!.tokens;
    }
    if (tokens <= 0) return 0;

    const first = this.events[this.startIndex]!;
    const last = this.events[this.events.length - 1]!;
    let spanStart = first.time;
    if (first.time === last.time && this.startIndex > 0) {
      spanStart = this.events[this.startIndex - 1]!.time;
    }

    const spanMs = Math.max(now - spanStart, MIN_SPAN_MS);
    return (tokens * 1_000) / spanMs;
  }

  reset(): void {
    this.events.length = 0;
    this.startIndex = 0;
  }

  get size(): number {
    return this.events.length - this.startIndex;
  }
}

const TOKEN_RE = /\w+|[^\s\w]/gu;

/**
 * Cheap, provider-independent token estimate used only for the live number.
 * Word runs and individual punctuation/CJK characters count as tokens.
 * The final value uses provider usage, so live drift never affects it.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const matches = text.match(TOKEN_RE);
  return matches ? matches.length : 0;
}

/** Whole t/s at 10+, one decimal below. */
export function formatTps(tps: number): string {
  if (!Number.isFinite(tps) || tps <= 0) return "0";
  if (tps >= 10) return String(Math.round(tps));
  return (Math.round(tps * 10) / 10).toFixed(1);
}

export function isDisplayableSample(sample: {
  outputTokens: number;
  decodeMs: number;
}): boolean {
  return (
    sample.outputTokens >= MIN_DISPLAY_OUTPUT_TOKENS &&
    sample.decodeMs >= MIN_DISPLAY_DECODE_MS
  );
}
