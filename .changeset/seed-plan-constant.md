---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

A `derived` SSR seed-plan step now carries `constant` (it reads only inlined module consts, or nothing), and the template adapters read it to keep the static ssr-defaults seed for a constant signal or memo instead of scanning the rendered template text for a variable. On Xslate a constant seed lowered through a `$bf.` helper (`[{ a: 'p' }].map(t => t.a).join(',')`) is no longer recomputed in-template; the rendered value is unchanged.
