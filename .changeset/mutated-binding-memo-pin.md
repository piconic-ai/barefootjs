---
"@barefootjs/hono": patch
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

Register a known limitation: a component-body statement that mutates a binding (`local.push('z')`) and is read through a memo renders the value from before the statement in the server HTML, because the statement runs only on the client at mount. No rendering changes; the fixture and the per-adapter pins only record the gap (#3719).
