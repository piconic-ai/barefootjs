---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
---

Lower `Array.prototype.reduceRight(fn, init)` to the template-language adapters (#1448 Tier C follow-up).

`.reduceRight` reuses the `.reduce` arithmetic-fold catalogue (#1728) — same `ReduceOp` shapes (numeric sum / product over self or a field, string concatenation, single-`return` block bodies, literal init) — and threads a fold **direction** through to the runtime. The direction is only observable for string concatenation: a left-to-right concat of `[a, b, c]` is `abc`, while right-to-left is `cba`. Numeric sum / product are commutative, so the direction doesn't change them.

- Parser: the existing reduce interception now also accepts `reduceRight`, preserving the method name on the `array-method` variant. Off-catalogue / no-init forms still refuse with BF101.
- Emitter: `reduceMethod()` now receives the method name (mirroring `sortMethod()`), so adapters pick the direction.
- Go: `bf_reduce` gains a trailing `"<direction>"` operand and folds right-to-left when it's `"right"`.
- Mojo: `bf->reduce` takes a `direction => 'left' | 'right'` option and reverses the snapshot for `'right'`.

Cross-adapter byte-equality (Hono/CSR, Go, Mojo) verified by a new `reduce-right-concat` conformance fixture (the concat case is the direction discriminator).
