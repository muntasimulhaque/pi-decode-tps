# pi-decode-tps

[![npm](https://img.shields.io/npm/v/pi-decode-tps?style=flat-square)](https://www.npmjs.com/package/pi-decode-tps)
[![CI](https://github.com/muntasimulhaque/pi-decode-tps/actions/workflows/ci.yml/badge.svg)](https://github.com/muntasimulhaque/pi-decode-tps/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/pi-decode-tps?style=flat-square)](LICENSE)

Decode throughput for Pi's footer: **one exact number per completed response.** Live TPS is available on demand in `/tps`.

The footer is stable by default, like Hermes's built-in number and DSH: it does not repaint on every streamed chunk.

```text
~\Documents\GitHub\quran (main)
↑358k ↓104k R42M CH99.6% $0.244 30.9%/1.0M      (opencode-go) deepseek-v4.1-flash • max
⚡ 46 t/s
```

The status line is added with `ctx.ui.setStatus()`. It does not replace or modify Pi's built-in footer.

## What it measures

**Decode TPS** = output tokens ÷ time from the first streamed token to the end of the assistant message.

It deliberately excludes:

- prompt prefill and time to first token (TTFT)
- provider queueing and network time before the first token
- tool execution time (`message_end` fires before tools run)

This is the convention used by llama.cpp/Ollama/vLLM generation throughput and by Artificial Analysis's "Output Speed". It is **not** the same as Hermes's built-in rolling last-10 number, which includes prefill and whole-request time.

| | Footer update | Includes TTFT? |
|---|---|---|
| **pi-decode-tps** | once per response (live in `/tps`) | no |
| Hermes built-in | per completed API call | yes |
| Hermes token-speed plugin | ~4×/sec | no |
| DSH / pi-dsh-tps | per response | no |

## Stable footer, live on demand

- **When a response ends:** the exact decode TPS is computed from the provider's `usage.output` and the measured decode window, then shown dim. This is the only time the footer value changes during normal use.
- **While streaming:** the footer keeps the previous exact value. If you run `/tps` mid-stream, it shows a live 1-second-window estimate on demand.
- The live estimate is a sliding window over `text_delta`, `thinking_delta`, and `toolcall_delta` chunks. Tokens are estimated cheaply (word/punctuation/CJK characters), so it is approximate. It is never written to the footer automatically.
- Responses with no first token, no usage, zero output, or `pending`/`error`/`aborted`/`deferred` stop reasons are skipped.
- A short response does not overwrite a meaningful footer value. The first sample is shown even if short; after that, samples under 20 output tokens or 300 ms decode are ignored for the footer (but still counted in `/tps`).

`usage.output` already includes reasoning tokens, so hidden thinking is included automatically.

## Install

```bash
pi install npm:pi-decode-tps
```

Try it for one run without installing:

```bash
pi -e npm:pi-decode-tps
```

Or install from GitHub:

```bash
pi install git:github.com/muntasimulhaque/pi-decode-tps
```

Restart Pi, or run `/reload`, after installing.

## Usage

- The footer shows `⚡ 46 t/s` after the first completed response. It stays hidden until then.
- It does not change while streaming; it updates once when the response ends.
- Run `/tps` for a breakdown: last response, TTFT, end-to-end throughput, estimate drift, task average, session average, and model/provider. If a response is in progress, `/tps` also shows the live estimate.
- Run `/tps reset` to clear the collected statistics and the footer value.

If you want a constantly updating footer meter, use something like `pi-pulse`; this package deliberately keeps the footer stable.

Session and task statistics are in memory. They reset when Pi restarts, when the extension reloads, or when you switch sessions. (Persistence can be added later with custom session entries if wanted.)

The extension uses the status key `tps`. Do not run it alongside another extension that writes the same key (for example pi-pulse).

## Accuracy notes

- The live estimate (only shown in `/tps` on demand) is a regex estimate. Expect roughly ±20% drift on mixed text/code; the exact post-response value does not use the estimate.
- Exact TPS uses the provider-reported `usage.output`. If a provider omits usage for a response, that response is skipped rather than guessed.
- Decode time is measured client-side at Pi's event boundaries, so it can differ slightly from a server-side eval timer.
- TTFT is measured from `AssistantMessage.timestamp` (request start) to the first non-empty delta; it includes queueing, prefill, and network time.
- End-to-end TPS in `/tps` is `usage.output ÷ AssistantMessage.durationMs`, which is useful for comparing against Hermes-style numbers.

## Development

```bash
npm install
npm test
npm run typecheck
```

The extension is plain TypeScript with no runtime dependencies. Pi loads `src/index.ts` directly through jiti.

## License

MIT
