---
"@barefootjs/jsx": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/go-template": patch
---

A boolean that reaches an output through `??`, `||`, `&&`, a ternary branch or a `boolean | string` prop now prints `true` / `false` as JS does. Mojolicious and Xslate printed a `false` prop or signal as `0` and `true` as `1` (`data-v={value ?? 'none'}` rendered `data-v="0"`); the fix covers attributes, text, string concatenation, loop rows and a child that prints the forwarded value. Go templates printed the fallback for `flag() ?? 'none'` when a `boolean | undefined` signal held `false`; it now tests the signal for nil only, as it already did for an optional prop.
