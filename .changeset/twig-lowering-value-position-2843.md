---
"@barefootjs/twig": patch
---

Fix #2843: a registered lowering call (`queryHref`, or any userland plugin) inside a ternary attribute branch — or any other nested value position, e.g. a template-literal interpolation — is now recognized instead of refusing the call's object-literal argument with BF101. `TwigTopLevelEmitter` gained a `lowering` seam consulted by the shared `emitParsedExpr` dispatcher before its own `call()` method, and the adapter's support gate (`isSupported`/`isSupportedValue`) is now registry-aware, matching the direct-call attribute path exactly. Also fixes a latent bug in `parseUndefinedAlternateTernary`'s consumer: the consequent was re-lowered from a lossy debug-formatted string (`exprToString`, which renders an unsupported nested shape as non-reparseable `[UNSUPPORTED: …]` text) instead of the already-parsed tree, corrupting a `queryHref`-shaped consequent under the `cond ? queryHref(...) : undefined` attribute-omission shape.
