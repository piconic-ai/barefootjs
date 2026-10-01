---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Keep literal-seeded signals independent from same-named bare props by separating their lexical bindings before building IR. Preserve object keys, shadowed callback bindings, caller-facing prop names, and build-supplied type information. Compute Go numeric memos over distinct signal and required prop values instead of silently seeding zero. Graduate the signal/prop name-collision limitation and retain its fixture as a regression test.
