---
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

A conditional that directly abuts text (`x:{c ? 'on' : 'off'}`, `{c ? 'on' : 'off'}:y`) no longer renders whitespace between the text and the chosen branch on the template adapters. Before, the conditional's control tags were emitted on their own lines, and those newlines surfaced as a space (`x: off`, `off :y`), which differed from Hono's `x:off` / `off:y`. Jinja, MiniJinja, Twig, Pebble, ERB and Blade now emit the control tags inline. Mojolicious keeps line statements but escapes the newline before each one. Xslate uses the inline `<: … :>` tag form.
