---
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

`renderDivergences` now declares the `component-root-client-scope` fixture under the new `component-root-client-scope-comment` known limitation: for a client component whose entire JSX return is a single child-component call, these adapters render the child's output without the parent's `<!--bf-scope:...-->` comment pair that the reference emits, so the parent never hydrates on the client (its forwarded handlers do nothing). This records the gap in the compat report and conformance skip list; the adapters' output is unchanged.
