---
"@barefootjs/jsx": patch
---

Fix a reactive `.map()` row's plain (non-destructured) callback param being accessor-wrapped (`choice` → `choice()`) at object-literal key, shorthand-property, and member/property-name positions, not just genuine value references. A shorthand property (`{ choice }`) or an explicit key (`{ choice: 1 }`, `{ choice: choice }`) previously produced invalid JS (`{ choice() }`, `{ choice(): 1 }`) that failed to build; a member access (`obj.choice`) previously produced valid-but-wrong JS (`obj.choice()`) that threw a `TypeError` when a new row was created on the client. `wrapLoopParamAsAccessor`'s plain-param branch and `wrapIndexParamAsAccessor` now walk the real AST instead of a `\bname\b`-style regex, so only actual value-reference positions are rewritten — the plain-parameter sibling of #1244's destructured-binding fix.
