import { SlidingWindow, estimateTokens, isDisplayableSample } from "./measure.ts";

const VALID_STOP_REASONS = new Set(["stop", "length", "toolUse"]);

export interface FinishInput {
  outputTokens: number;
  stopReason: string;
  durationMs?: number;
  now: number;
  model?: string;
  provider?: string;
}

export interface Sample {
  outputTokens: number;
  decodeMs: number;
  ttftMs: number | null;
  tps: number;
  endToEndTps: number | null;
  estimatedTokens: number;
  model?: string;
  provider?: string;
  timestamp: number;
}

export interface Totals {
  outputTokens: number;
  decodeMs: number;
  responses: number;
}

interface CurrentStream {
  requestAt: number;
  firstTokenAt: number | null;
  estimatedTokens: number;
  window: SlidingWindow;
}

function emptyTotals(): Totals {
  return { outputTokens: 0, decodeMs: 0, responses: 0 };
}

export class TpsTracker {
  private current: CurrentStream | null = null;
  private _last: Sample | null = null;
  private _shown: Sample | null = null;
  private _task = emptyTotals();
  private _session = emptyTotals();

  get last(): Sample | null {
    return this._last;
  }

  get shown(): Sample | null {
    return this._shown;
  }

  get task(): Totals {
    return this._task;
  }

  get session(): Totals {
    return this._session;
  }

  get isStreaming(): boolean {
    return this.current !== null && this.current.firstTokenAt !== null;
  }

  get estimatedStreamTokens(): number {
    return this.current?.estimatedTokens ?? 0;
  }

  beginMessage(requestAt: number): void {
    this.current = {
      requestAt: Number.isFinite(requestAt) ? requestAt : Date.now(),
      firstTokenAt: null,
      estimatedTokens: 0,
      window: new SlidingWindow(),
    };
  }

  recordDelta(delta: string, now: number): void {
    const stream = this.current;
    if (!stream) return;

    const tokens = estimateTokens(delta);
    if (tokens <= 0) return;

    if (stream.firstTokenAt === null) stream.firstTokenAt = now;
    stream.estimatedTokens += tokens;
    stream.window.record(tokens, now);
  }

  liveTps(now: number): number {
    return this.current ? this.current.window.tps(now) : 0;
  }

  finishMessage(input: FinishInput): Sample | null {
    const stream = this.current;
    this.current = null;

    if (!stream || stream.firstTokenAt === null) return null;
    if (!VALID_STOP_REASONS.has(input.stopReason)) return null;
    if (!Number.isFinite(input.outputTokens) || input.outputTokens <= 0) return null;

    const decodeMs = input.now - stream.firstTokenAt;
    if (!Number.isFinite(decodeMs) || decodeMs <= 0) return null;

    const durationMs =
      typeof input.durationMs === "number" && input.durationMs > 0
        ? input.durationMs
        : null;

    const sample: Sample = {
      outputTokens: input.outputTokens,
      decodeMs,
      ttftMs: Math.max(0, stream.firstTokenAt - stream.requestAt),
      tps: input.outputTokens / (decodeMs / 1_000),
      endToEndTps: durationMs === null ? null : input.outputTokens / (durationMs / 1_000),
      estimatedTokens: stream.estimatedTokens,
      model: input.model,
      provider: input.provider,
      timestamp: input.now,
    };

    this._last = sample;
    addSample(this._task, sample);
    addSample(this._session, sample);

    // Keep a meaningful value in the footer. A very first short sample is
    // still shown; after that, short responses don't overwrite a good number.
    if (isDisplayableSample(sample) || this._shown === null) {
      this._shown = sample;
    }

    return sample;
  }

  resetTask(): void {
    this._task = emptyTotals();
  }

  resetAll(): void {
    this.current = null;
    this._last = null;
    this._shown = null;
    this._task = emptyTotals();
    this._session = emptyTotals();
  }
}

function addSample(totals: Totals, sample: Sample): void {
  totals.outputTokens += sample.outputTokens;
  totals.decodeMs += sample.decodeMs;
  totals.responses += 1;
}

export function totalsTps(totals: Totals): number {
  return totals.decodeMs > 0
    ? totals.outputTokens / (totals.decodeMs / 1_000)
    : 0;
}
