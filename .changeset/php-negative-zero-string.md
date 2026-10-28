---
"@barefootjs/php": patch
"@barefootjs/blade": patch
"@barefootjs/twig": patch
---

Blade and Twig: a number operand of `+` string concatenation now goes through the runtime's JS `String()` before PHP's `.` / Twig's `~`, so `'r=' + (-4 % 2)` renders `r=0` instead of `r=-0` (#3698). An operand the shared layer types as a string is emitted as before. The same conversion also gives JS's spelling for an infinity (`Infinity`, not `INF`) and a boolean (`true`, not `1`). The PHP runtime's `json` (`JSON.stringify`) writes a float `-0.0` as `0`, on its own and inside an array or object.
