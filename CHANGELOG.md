# Changelog

## 0.2.0

- The footer is stable by default: TPS updates once per completed response instead of repainting 4×/sec while streaming.
- The live 1-second-window estimate remains available in `/tps` on demand.
- Matches the calm behavior of Hermes's built-in number and DSH.

## 0.1.1

- Skip theme/status work outside TUI mode (print, JSON, and RPC sessions).

## 0.1.0

- Initial release.
- Live decode TPS in the status line from a 1-second sliding window.
- Exact decode TPS after each completed response, using provider `usage.output`.
- `/tps` breakdown with TTFT, end-to-end throughput, task/session averages, and live estimate drift.
- `/tps reset` clears the collected statistics.
