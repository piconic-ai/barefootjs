---
"@barefootjs/client": patch
---

Fixes #2959: a `'use client'` fragment-root child component mounted as an ordinary nested child inside a parent's own fragment-conditional branch (the plain `t && initChild(name, t, props)` call a compiled `bindEvents` makes, not `upsertChild`/`materializeComponent`) could have its OWN internal conditional permanently stop updating after the very first render, with no error and no warning.

Root cause: `updateFragmentConditional` (`packages/client/src/runtime/insert.ts`) splices a branch's freshly parsed content between the real, persistent `bf-cond-start:<id>`/`bf-cond-end:<id>` DOM markers already bracketing the insertion point, after first stripping the branch's own redundant copy of that same wrapper (`addCondAttrToTemplate` always embeds one in the template). The old filter dropped ANY top-level comment whose value merely started with `bf-cond-`, not only that specific pair — so a fragment-root child mounted inside the branch (no wrapper element of its own) had ITS OWN `bf-cond-start:<childId>`/`bf-cond-end:<childId>` markers erased from the DOM outright, since they sit as top-level siblings of its other output. With no markers left anywhere, the child's own `insert()` call could never find its start comment again on any later toggle.

Now only the parsed fragment's own first/last child is stripped, and only when it matches the current id's marker value exactly.
