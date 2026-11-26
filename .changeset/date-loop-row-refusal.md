---
"@barefootjs/jsx": patch
---

A catalogued `Date` call on a `.map()` row (`rows.map(r => r.at.getUTCFullYear())`) is still refused with BF021. The message now says that the receiver is read through the loop row binding and that the Date lowering only resolves receivers read through props. Before, it claimed the method has no catalogued lowering. The loop-row message is used only when the same call would lower on a `Date` prop: a `toLocaleDateString` without an explicit literal `timeZone` keeps the uncatalogued message. For a receiver read through `?.`, the suggestion asks you to keep the null guard instead of offering an unguarded `new Date(...)` rewrite. A destructured row (`rows.map(({ at }) => at.getUTCFullYear())`) is refused the same way; before, it reached the template adapters as a plain method call on the row field.
