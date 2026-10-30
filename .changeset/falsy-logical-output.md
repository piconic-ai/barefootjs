---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/jinja": patch
"@barefootjs/perl": patch
---

A falsy value that `&&`, `||` or `??` returns now reaches an output as JS renders it.

- An attribute bound to `&&` or a ternary branch whose value is an absent optional prop (`data-x={props.on && 'y'}`) is omitted, as Hono omits an `undefined` attribute, on every template adapter. It rendered `data-x=""` (Go: `data-x="false"` / `"0"`).
- Mojolicious and Xslate print a comparison that `&&` / `||` / `??` returns as `true` / `false` in an attribute, a template literal and string concatenation (`data-x={items.length > 0 && 'y'}` rendered `data-x=""`, a template literal `0`), and write a boolean inside the array `JSON.stringify` writes as a JSON boolean (`[1,true,false]`, not `[1,1,0]`). The Perl runtime gains `boolean`, which returns a JSON boolean.
- Go templates keep the left operand of `??` when it can never be nullish: a required `boolean` / `string` / `number` prop holding `false` / `''` / `0`, or a comparison. They took the fallback.
- Jinja tests the left operand of `??` as a whole when it is a comparison or arithmetic (`(n > 1) ?? 'y'` tested `1` and took the fallback).
