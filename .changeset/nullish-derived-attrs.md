---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/pebble": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

An attribute whose value is `undefined` / `null` through a memo (`title={label()}`), an optional member read (`data-name={user()?.name}`) or a ternary branch (`data-choice={on() ? s() : 'x'}`) is now omitted on the template adapters, as on Hono, instead of rendering `attr=""`. Present values, including `''` and `0`, still render. The shared `attrValueMayBeNullish` (`@barefootjs/jsx`) decides which values are guarded. On Go, a memo over an `undefined`-initialized signal is now seeded `nil` in the Props constructor instead of `0`.
