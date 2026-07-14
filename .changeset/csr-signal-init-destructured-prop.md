---
"@barefootjs/jsx": patch
---

Fix #2265: a stateful destructured component whose signal seed references a destructured prop (`const [count] = createSignal(size ?? 1)` with `{ size }: { size?: number }`) no longer throws `ReferenceError: size is not defined` when the generated `hydrate(..., { template: (_p) => ... })` CSR fallback arrow evaluates.

That module-scope arrow isn't a closure over `initXxx`'s `const size = _p.size` extraction, so a signal's initial value referencing a bare destructured prop needs the reference rewritten to `_p.size` ahead of time — the same treatment `templateExpr`/`templateArray`/`templateCondition` already give other IR positions (#2222 fixed the loop-source case; this is the signal-initial-value case, pre-existing independent of that fix). Adds `SignalInfo.templateInitialValue`, computed by the analyzer at signal-collection time via the existing `rewriteBarePropRefs` AST walk, and consumed by the CSR template's `normalizeSignalInitial`.

Removes the `nullish-coalescing-destructured` CSR-conformance skip.
