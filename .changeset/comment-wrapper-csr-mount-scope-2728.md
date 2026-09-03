---
"@barefootjs/client": patch
---

Fix #2728: a "root is a child call" comment-wrapper component (`comment: true`, no `fragmentRoot` — the shape a `'use client'` component compiles to when its entire render is a single child-component call, e.g. a demo/story component wrapping `<Tabs>...</Tabs>`) mounted bare at the top level via `createComponent` (the CSR-mount path, no SSR markup to hydrate from) never registered a `<!--bf-scope:-->` boundary-comment pair for itself, unlike hydration's `hydrateCommentScope`, which does register one from the SSR-rendered comments. `$c()`'s dual-scope lookup then found nothing for any of the wrapper's own sibling child slots baked into its template — they were never `initChild`'d at all, so their props and event handlers never ran even though their markup was present (dead click handlers, un-applied template-only attributes).

`materializeComponent` now emits the same boundary-comment pair for this wrapper shape that a genuine fragment root already gets (#2722), derived from the same id `#2757` already computed for thread-only purposes. A bare top-level mount of this shape now returns a `DocumentFragment` (matching the existing fragment-root contract) instead of a bare `HTMLElement` — six existing tests that assumed the old return shape are updated to append-then-requery rather than operate on the returned handle directly.

Verified against the real oracle harness: `tabs`' `three-point` and `idempotence` oracles, previously quarantined (`packages/adapter-tests/e2e/oracle-quarantine.ts`) under this exact issue, both pass in real Chromium.
