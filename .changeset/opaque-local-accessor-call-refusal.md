---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
"@barefootjs/go-template": patch
---

A component-body local bound to an opaque call (`const label = makeLabel(); {label()}`, or a library-returned accessor like `const posts = createQuery(...)`) invoked in text position now refuses to compile with `BF101` on every non-JS-runtime adapter, instead of silently lowering to a bare template-variable lookup with no backing value (an empty or failing render, with no diagnostic). Hono's real JS runtime keeps evaluating this shape correctly and is unaffected. Add `/* @client */` before the call to defer it to the client, or pre-compute the value in the backend.
