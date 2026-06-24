---
"@barefootjs/jsx": patch
---

Infer `createMemo` field types via the type checker (#1968).

When the syntactic `inferTypeFromValue` heuristic can't resolve a memo's type (`object`/`unknown` — e.g. a local-function call like `generateCalendarDays()` or a ternary of typed arrays) and a type checker is available, the analyzer now asks it for the memo body's return type and converts it to `TypeInfo`. Adapters then generate precise types (`[][]CalendarDay`, `[]string`, `bool`, `string`) instead of `map[string]interface{}` / `bool` placeholders, so a typed backend (e.g. Go) can populate the SSR data. Only imprecise syntactic results are upgraded; already-precise types are untouched.
