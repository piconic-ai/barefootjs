---
"@barefootjs/go-template": patch
---

Fix a memo derived from another memo (`label = createMemo(() => doubled() + 1)`, where `doubled` is itself `createMemo(() => count() * 2)`) rendering EMPTY on the Go template adapter — only the first derivation layer SSR-computed correctly.

`memoInitialFromParsedBody` (`memo/memo-compute.ts`) resolves a memo's SSR initial-value expression by looking up its dependency's getter name — but its arithmetic-binary-op branch (`() => <ref> <op> <int>`) and its bare-getter branch (`() => getter()`) each did this with a `signals.find(...)`-only lookup, never consulting `ctx.state.currentMemos`. `doubled` is a memo, not a signal, so `label`'s dependency on it was never recognized at all; the field was silently omitted from the constructor, defaulting to Go's zero value (`nil`, since the type inferencer also couldn't resolve a concrete type once the fold failed).

The fix routes both branches through the existing `resolveGetterValueAsGo` helper (already used by this file's ternary-condition and filter-arm-sibling resolvers for exactly this signal-or-memo distinction) instead of hand-rolling a signals-only lookup — it checks `signals` first (unchanged behavior for a signal-derived memo like `doubled`), then falls back to `ctx.state.currentMemos` and recurses with the same `resolving`-set self/mutual-reference guard the other call sites already use, correctly folding an arbitrarily deep memo chain rather than just one level.

`memo-chain` graduates from a render divergence to a passing render.
