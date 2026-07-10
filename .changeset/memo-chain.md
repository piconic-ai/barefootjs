---
"@barefootjs/go-template": patch
---

Fix a memo derived from another memo (`label = createMemo(() => doubled() + 1)`, where `doubled` is itself `createMemo(() => count() * 2)`) rendering EMPTY on the Go template adapter — only the first derivation layer SSR-computed correctly.

`memoInitialFromParsedBody` (`memo/memo-compute.ts`) resolves a memo's SSR initial-value expression by looking up its dependency's getter name — but its arithmetic-binary-op branch (`() => <ref> <op> <int>`) and its bare-getter branch (`() => getter()`) each did this with a `signals.find(...)`-only lookup, never consulting `ctx.state.currentMemos`. `doubled` is a memo, not a signal, so `label`'s dependency on it was never recognized at all; the field was silently omitted from the constructor, defaulting to Go's zero value (`nil`, since the type inferencer also couldn't resolve a concrete type once the fold failed).

The fix routes both branches through the existing `resolveGetterValueAsGo` helper (already used by this file's ternary-condition and filter-arm-sibling resolvers for exactly this signal-or-memo distinction) instead of hand-rolling a signals-only lookup — it checks `signals` first (unchanged behavior for a signal-derived memo like `doubled`), then falls back to `ctx.state.currentMemos` and recurses with the same `resolving`-set self/mutual-reference guard the other call sites already use, correctly folding an arbitrarily deep memo chain rather than just one level.

The arithmetic branch also now parenthesizes a compound `depInitial` (detected by the presence of whitespace — a signal's own initial value is always a simple atom and never needs it) before splicing it under the memo's own operator, so a differently-shaped chain (e.g. `inner = () => count() + 1` then `outer = () => inner() * 2`) can't silently invert precedence (`3 + 1 * 2` = 5 in Go vs JS's `(3+1)*2` = 8) the way an unconditional bare substitution would have.

`memo-chain` graduates from a render divergence to a passing render.

**Known residual limitation**: a sibling shape — a boolean SELECTION memo derived from another memo (`sel = createMemo(() => label() === 'x')`, where `label` is itself a memo, as opposed to a signal) — has the identical signals-only-lookup gap in this same file's equality-comparison-to-bool branch, and still folds to the zero value (`false`). No fixture exercises this shape today; fixing it is a separate, structurally different change (recursively computing a memo's initial value as a STRING and checking whether it takes a quoted-literal shape, rather than this PR's straightforward value-substitution), out of scope here.
