---
"@barefootjs/jsx": patch
---

A catalogued `Date` call on a `.map()` row (`rows.map(r => r.at.getUTCFullYear())`) is still refused with BF021, but the message now says the receiver is read through the loop row binding and that the Date lowering only resolves receivers read through props, instead of claiming the method has no catalogued lowering. A destructured row (`rows.map(({ at }) => at.getUTCFullYear())`) takes the same refusal; before, it reached the template adapters as a plain method call on the row field.
