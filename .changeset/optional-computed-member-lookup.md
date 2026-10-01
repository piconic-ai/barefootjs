---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/go-template": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/perl": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Render literal computed members through index/key lookup, preserving optional numeric indices and punctuation-containing object keys in values, conditions, and filter predicates. Keep absent optional nested Go objects distinct from present zero-valued objects, and prevent Mojolicious strict literal comparisons from matching an absent lookup to false or zero. Graduate the corresponding silent limitations while retaining their conformance fixtures as regression coverage.
