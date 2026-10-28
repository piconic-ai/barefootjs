---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Arithmetic over a number prop declared both optional and nullable (`n?: number | null`, `n: number | null | undefined`) is now refused with BF101 on the template adapters. JS reads an omitted prop as `undefined` (`NaN` in arithmetic) and a `null` one as `0`, but a template engine holds both as the same nil, so the server render used to show `0` where Hono shows `NaN`. Declare the prop as only optional (`n?: number`) or only nullable (`n: number | null`), or give it a default. The refusal covers attributes, text, conditions, child props, loop bodies, `.filter()` predicates and memo bodies.

A destructured prop typed as a nullable number union (`{ n }: { n: number | null }`, `{ n }: { n?: number | undefined }`) now gets the same arithmetic coercion as the `props.n` form: a `null` one reads as `0` and an omitted one as `NaN`. Before, Jinja, MiniJinja, ERB and Pebble failed the render on the nil operand, and the other adapters read an omitted one as `0`.
