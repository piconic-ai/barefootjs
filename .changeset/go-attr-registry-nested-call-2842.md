---
"@barefootjs/go-template": patch
---

Fix #2842: a registered lowering (`queryHref`, or any userland plugin) reached through a nested position — the `undefined`-alternate ternary attribute shape (`cond ? queryHref(...) : undefined`), a template-literal interpolation, or a nested ternary branch — now renders correctly instead of emitting invalid Go template syntax with no diagnostic. The shared ParsedExpr `call()` dispatcher now consults the lowering-plugin registry (the same registry the top-level attribute path already used), and the `undefined`-alternate omission shape additionally routes a `queryHref`-shaped consequent through the `bf_attr` whole-attribute bypass (#2743/#2841) inside its `{{if}}` wrapper, so it gets the same URL-context-escaping parity with the reference as every other `queryHref` position.
