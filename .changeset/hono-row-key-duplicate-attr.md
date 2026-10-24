---
"@barefootjs/hono": patch
---

Stop emitting an author `data-key` attribute on a keyed `.map()` row root (or a keyed component invocation) beside the synthesized row-key `data-key`. The duplicate JSX attribute failed type-checking (TS17001) in the emitted template; Hono already rendered only the synthesized key, so the SSR HTML is unchanged.
