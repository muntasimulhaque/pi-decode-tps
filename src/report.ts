import type { Sample, Totals } from "./engine.ts";
import { totalsTps } from "./engine.ts";
import { formatTps, isDisplayableSample } from "./measure.ts";

export interface ReportInput {
  last: Sample | null;
  shown: Sample | null;
  task: Totals;
  session: Totals;
  liveTps: number;
  streaming: boolean;
  estimatedStreamTokens: number;
}

export function formatReport(input: ReportInput): string {
  const lines: string[] = [
    "Decode TPS — excludes TTFT/prefill and tool time",
    "",
  ];

  if (!input.last) {
    lines.push("No completed response yet. Send a prompt first.");
    if (input.streaming) {
      lines.push(
        `live  ${formatTps(input.liveTps).padStart(6)} t/s  estimated, 1s window (${formatCount(input.estimatedStreamTokens)} tok so far)`,
      );
    }
    return lines.join("\n");
  }

  const last = input.last;
  lines.push(
    `last     ${formatTps(last.tps).padStart(6)} t/s  ${formatCount(last.outputTokens)} tok / ${formatSeconds(last.decodeMs)} decode`,
  );

  const details: string[] = [];
  if (last.ttftMs !== null) details.push(`TTFT ${formatSeconds(last.ttftMs)}`);
  if (last.endToEndTps !== null) {
    details.push(`end-to-end ${formatTps(last.endToEndTps)} t/s`);
  }
  if (last.estimatedTokens > 0 && last.outputTokens > 0) {
    const drift = ((last.estimatedTokens - last.outputTokens) / last.outputTokens) * 100;
    const sign = drift >= 0 ? "+" : "";
    details.push(
      `live estimate ${formatCount(last.estimatedTokens)} tok (${sign}${drift.toFixed(0)}%)`,
    );
  }
  if (details.length > 0) lines.push(`         ${details.join(" · ")}`);

  if (input.shown && input.shown !== last) {
    lines.push(
      `shown    ${formatTps(input.shown.tps).padStart(6)} t/s  previous meaningful sample (last was too short for the footer)`,
    );
  } else if (!isDisplayableSample(last)) {
    lines.push("         short sample — shown because it is the first sample");
  }

  if (input.streaming) {
    lines.push(
      `live     ${formatTps(input.liveTps).padStart(6)} t/s  estimated, 1s window (${formatCount(input.estimatedStreamTokens)} tok so far)`,
    );
  }

  if (input.task.responses > 0) {
    lines.push(
      `task     ${formatTps(totalsTps(input.task)).padStart(6)} t/s  ${formatCount(input.task.outputTokens)} tok / ${formatSeconds(input.task.decodeMs)} decode (${plural(input.task.responses)})`,
    );
  }
  if (input.session.responses > 0) {
    lines.push(
      `session  ${formatTps(totalsTps(input.session)).padStart(6)} t/s  ${formatCount(input.session.outputTokens)} tok / ${formatSeconds(input.session.decodeMs)} decode (${plural(input.session.responses)})`,
    );
  }

  if (last.provider || last.model) {
    lines.push(`model    ${[last.provider, last.model].filter(Boolean).join(" / ")}`);
  }

  return lines.join("\n");
}

function formatSeconds(ms: number): string {
  return ms < 1_000 ? `${Math.round(ms)}ms` : `${(ms / 1_000).toFixed(2)}s`;
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function plural(count: number): string {
  return `${count} response${count === 1 ? "" : "s"}`;
}
