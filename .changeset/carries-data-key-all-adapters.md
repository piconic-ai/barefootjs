---
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Honour `IRElement.carriesDataKey` in the eight non-Hono adapters. The #2732 fix taught the compiler to mark the element a fragment root's `data-key` belongs on, but only `hono-adapter.ts` read the flag; every other adapter still gated `data-key` purely on `rootScopeNodes.has(element) && element.needsScope`, which is false for a fragment root's wrapped child by construction. A fragment-rooted keyed loop row therefore lost its key in eight of the nine backends — the same silent divergence #2732 fixed for Hono, left in place everywhere else.

`carriesDataKey` is an independent reason to emit, not a refinement of the root-scope test, so the condition is widened rather than replaced.
