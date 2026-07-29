---
"@barefootjs/hono": patch
---

Fix the Hono adapter dropping a conditional branch's own `bf:sN` slot
marker, the only renderer among erb/jinja/go-template/mojolicious/hono to do
so.

`loop-branch-stale-text` (previous changeset) gave a keyed `.map()` row's
bare-expression conditional branch (`task.done ? task.label : 'pending'`)
its own `slotId` so a per-item update effect can rewrite it without the
outer conditional re-evaluating. `irToHtmlTemplate` renders that marker
identically into the CSR/hydration template and every marked-template
adapter (erb: `bf.text_start("s1")`…`bf.text_end`; jinja/go-template:
`bfTextStart "s1"`…`bfTextEnd`; mojolicious: `bf->text_start("s1")`…
`bf->text_end`). The Hono adapter renders conditional branches through a
separate path (`renderNodeRawCtx`/`wrapWithCondMarker` in
`hono-adapter.ts`) that bypassed `renderExpression` entirely for expression
nodes, so it never looked at the branch's `slotId` and emitted no marker at
all — just `{bfComment("cond-start:s0")}{task.label}{bfComment("cond-end:s0")}`.

Measured consequence: claiming that Hono-shaped branch HTML with
`lazySlots(branchScope, [{ id: 's1', kind: 'markup', path: [] }])` and
writing to it warned twice (`slot s1 marker not found; skipping`, `no
claimed slot for id s1; write ignored`) and left the DOM unchanged. A
Hono-server-rendered row hitting this exact shape stayed stale until its
first condition flip.

Fix: `wrapWithCondMarker`'s expression-node branch now checks the node's
own `slotId` and, when present, wraps the content in `{bfText(id)}`…
`{bfTextEnd()}` INSIDE the outer `cond-start`/`cond-end` pair — matching
every other adapter's marker structure byte-for-byte. A branch with no
`slotId` (a plain string literal, e.g. `conditional-wrapping-loop`'s
`'[x]'`/`'[ ]'`) gets no inner marker, unchanged. The existing
`bfText`/`bfComment`/`bfTextEnd` utility-import detection already scans the
generated code by identifier, so no import-list change was needed.

After the fix, claiming the same branch HTML updates the DOM
(`<!--bf:s1-->CCC<!--/-->`) with no warnings.

`loop-item-ternary-bare-branch`'s `expectedHtml` (adapter conformance
fixture) gains the inner `<!--bf:s1-->Write it<!--/-->` marker inside the
outer `bf-cond-start:s0`/`bf-cond-end:s0` pair — the only byte change
anywhere in the SSR/CSR conformance suites, since the earlier PR's
CI-generated regeneration had (wrongly) captured Hono's marker-omitting
output as the expected shape.
