---
"@barefootjs/go-template": patch
"@barefootjs/jsx": patch
---

Carry the regex-`replace` shape as pure IR, retiring an emit-time `ts.createSourceFile` / `parseLiteralExpression` re-parse in the go-template adapter (#2039).

- The regex form of `String.replace` is now carried structurally (an `array-method` `replace` whose first arg is a `regex` node) rather than collapsing to `unsupported`, so the derived-memo constructor lowering recovers the `/\/+$/` trailing-slash strip → `strings.TrimRight` off the IR, with no `ts.createSourceFile` on the `bf build` hot path. Template use of a regex `.replace` stays refused with the same deferred-form diagnostic via `isSupported`.

No change to rendered HTML across the go-template, Mojolicious, and Xslate SSR adapters.
