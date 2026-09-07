---
"@barefootjs/jsx": patch
---

Fix a `.map()` callback preamble local (e.g. `const cls = row.done ? 'a' : 'b'`) going stale inside a loop row's branch conditional: a reactive attribute reading the local, or a nested conditional's own condition reading it, used to freeze at whatever value the local had on the row's last full render instead of refreshing on a same-key data update — silently diverging from a sibling binding that read the underlying data directly. Both are now fixed by re-running the row's preamble inside the branch's own effect / condition getter, matching how this was already handled everywhere else (`emitAttrSlotsGranular`, `emitConsolidatedRowEffect`, the outer conditional's own condition getter).
