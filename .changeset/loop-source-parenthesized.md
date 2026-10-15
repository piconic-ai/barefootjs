---
'@barefootjs/jsx': patch
'@barefootjs/go-template': patch
'@barefootjs/blade': patch
'@barefootjs/jinja': patch
'@barefootjs/mojolicious': patch
'@barefootjs/pebble': patch
'@barefootjs/rust': patch
'@barefootjs/twig': patch
'@barefootjs/xslate': patch
---

A parenthesized computed-const loop source (`(entries).map(…)`) is refused with BF101 like the bare one. The computed-const gate now reads the loop source from its parsed tree, so the parentheses no longer hide the const, and Go Template and ERB stop compiling a loop over a variable the template never binds. The BF101 message names the const rather than the source text.
