---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

A `.map()` loop whose callback destructures its row param and whose row is a component (`shown().map(({ id, tone }) => <Mark key={id} tone={tone} />)`) now keeps each row's key and values. The client JS row factory read the destructured name where it isn't bound (`get tone() { return tone }`), so hydrating or creating a row threw a `ReferenceError`. It now reads `__bfItem().tone`. On Go, a destructured binding now resolves to its row field for the row's `data-key` and for props re-applied in the row's forwarded children, and those children read a destructured name off the row they render instead of the calling template's `{{range}}` variable. The new `lib/loop-row-path.ts` resolves a plain or destructured row read to its Go field path for every one of these sites.
