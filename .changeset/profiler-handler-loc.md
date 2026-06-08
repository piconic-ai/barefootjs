---
"@barefootjs/jsx": patch
---

Resolve handler turn ids to source loc in the batch advisor (#1690, #1790).

`buildIdIndex` now also registers handler turn ids
(`<Component>#handler:<slotId>:<eventName>`) from the graph's `event`
domBindings, and `analyzeBatchAdvisor(events, index?)` uses them so a candidate
carries the handler's `loc` + friendly name. The report now reads

    click@s1   batch candidate 14→5 (saves 9, safety unverified)  (Cart.tsx:14)

instead of citing the raw turn id. This is the handler-loc half of #1790; the
post-write-derived-read safety oracle (upgrading `unverified` → `safe`/`unsafe`)
is still tracked there.
