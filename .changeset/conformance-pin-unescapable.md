---
'@barefootjs/jsx': patch
'@barefootjs/blade': patch
'@barefootjs/erb': patch
'@barefootjs/go-template': patch
'@barefootjs/jinja': patch
'@barefootjs/mojolicious': patch
'@barefootjs/rust': patch
'@barefootjs/twig': patch
'@barefootjs/xslate': patch
---

`ConformancePin` gains an optional `unescapable?: { issue: string }` field, and every adapter's own `conformance-pins.ts` now declares it where a refusal has no verified escape yet (#2613).

This is the declaration an adapter uses to say "I refuse this fixture and there is no working `/* @client */` (or other) escape for it yet, tracked here." It matters for adapter authors: the escape-coverage floor test derives its entire domain from `loadCompatAdapters()`, so **a new adapter package declares its own escape debt in its own `conformance-pins.ts` and needs no change to `@barefootjs/compat`**. Previously the equivalent ledger was a set of hardcoded `"adapterId/fixtureId"` strings inside a core test, which would have required editing core to land a community adapter.

No runtime or emission behavior changes; this is a declaration surface only.
