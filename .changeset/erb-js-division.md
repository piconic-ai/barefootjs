---
"@barefootjs/erb": patch
---

Division (`{props.value / 4}`) now renders the JavaScript quotient on ERB. Ruby's `/` on two Integers is integer division, so `1234567890 / 4` rendered `308641972` and `-7 / 4` rendered `-2`; template-emitted `/` now goes through a new `bf.div` helper — the same JS division (JS `Number()` operand coercion, IEEE quotient) the callback evaluator uses — keeping JS's spelling (`308641972.5`, `-1.75`, `8 / 4` → `2`), with division by zero giving `Infinity` / `-Infinity` / `NaN`.
