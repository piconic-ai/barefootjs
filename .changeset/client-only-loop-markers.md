---
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Emit the `<!--bf-loop:<id>-->` / `<!--bf-/loop:<id>-->` boundary marker pair for clientOnly (`/* @client */`) loops (#2066). Both adapters previously rendered nothing at the loop position, so the client runtime's `mapArray()` resolved `anchor = null` and appended hydrated items after sibling markers (#872 defect class). The pair now matches Hono / Go emission, with per-call-site marker ids (#1087) keeping sibling `.map()` ranges distinct.
