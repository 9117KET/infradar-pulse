# AGENTS.md

- Lemon Squeezy is the only payment provider; do not reintroduce Paddle code paths. Why: the dormant duplicate stack risked billing state being written by the wrong provider.
- Server-side quota checks use the atomic `consume*Quota` helpers only. Why: the old check-then-increment helpers were racey and have been removed.
