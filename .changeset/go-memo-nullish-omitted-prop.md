---
"@barefootjs/go-template": patch
---

A memo that reads an optional prop with `??` (`createMemo(() => props.size ?? 'icon')`) now takes the fallback when the caller omits the prop. Before, the prop's Go field stayed a concrete `string` / `float64` when the `??` appeared only in a memo body, so the evaluator saw `""` or `0` and the memo rendered empty. A prop typed as a literal union (`size?: 'default' | 'icon'`, `level?: 1 | 2`) now gets the same nillable field as its primitive. A parent that forwards an omitted literal-union prop into a child reading it with `??` now hands the child nil too, so the child's fallback renders.
