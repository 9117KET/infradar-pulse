# AGENTS.md

- Lemon Squeezy is the only payment provider; do not reintroduce Paddle code paths. Why: the dormant duplicate stack risked billing state being written by the wrong provider.
- Server-side quota checks use the atomic `consume*Quota` helpers only. Why: the old check-then-increment helpers were racey and have been removed.
- Client code calls server functions only via `agentApi` or `callFunction` in `src/lib/api/agents.ts` (raw fetch only for file downloads/GET links). Why: one place to add auth, environment and error handling.
