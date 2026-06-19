---
"@barefootjs/go-template": minor
---

Inline local pure helper calls at template call sites (PostList derived-state blocker, #1897 follow-up — Capability B).

A call to a local, expression-bodied helper arrow const — `className={sortClass('date')}` where `const sortClass = (k) => params().sort === k ? 'sort on' : 'sort'` — previously lowered to `{{.SortClass "date"}}`, a method call on the Props struct with no Go method backing it (execute-time `can't evaluate field SortClass`). The adapter now inlines the helper's body at the call site, substituting the call arguments for the params (AST span-splice, so it is shadowing- and member-name-safe), and lowers the result: `class="{{if eq (bf_string .Params.Sort) "date"}}sort on{{else}}sort{{end}}"`. Works inside loops too (`tagClass(t)` resolves the loop var and root memo). Only self-contained helpers are inlined; one that delegates to another local helper (e.g. `sortHref` → `hrefFor`) is left untouched for a later capability. The attribute-value emitter no longer double-wraps an inlined helper that lowers to a self-contained `{{…}}` action block.
