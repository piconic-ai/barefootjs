---
"@barefootjs/jinja": patch
---

The engine-free evaluator returns `0` for `Number()` and `""` for `String()` called with no argument, as JavaScript does. Since U2 they returned `NaN` and `"undefined"`, because an omitted argument read as `undefined`. An explicit `undefined` argument still gives `NaN` / `"undefined"`.
