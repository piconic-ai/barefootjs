---
"@barefootjs/mojolicious": patch
---

Lower JS `===`/`!==` to Perl `eq`/`ne` when an operand is string-typed — a string signal getter (`sel()`) or a string prop (`props.x`), not only a string literal (#1672). Perl's numeric `==` coerces non-numeric strings to 0, so `"b" == "a"` was true and a whole-item loop conditional like `items().map(t => sel() === t.id && …)` rendered every item's true branch server-side. This unblocks the `loop-item-conditional` conformance fixture on Mojo.
