---
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/perl": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/php": patch
"@barefootjs/pebble": patch
"@barefootjs/erb": patch
---

A value-position `a && b` / `a || b` renders each operand once, so a chain such as `p.v0 || p.v1 || … || p.v15` grows the template linearly instead of doubling it at every link (a 16-operand chain was 0.9 to 2 MB of template). The operand JS yields, its JS truthiness and the short circuit are kept.

- Go, Jinja, MiniJinja, Twig, Blade, ERB, Mojolicious and Xslate box the left operand by its JS test with the new runtime helpers `keep_truthy` / `keep_falsy` (`bf_keep_truthy` / `bf_keep_falsy` in Go) and pick it with the language's own short-circuiting `or` / `?:` / `||`.
- Pebble spells them with `||` / `&&` operators from the runtime's new `JsLogicalExtension`, which `Main` registers beside `SetBlockExtension`. An application that builds its own `PebbleEngine` must register it too.
