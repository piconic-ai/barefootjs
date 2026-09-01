---
"@barefootjs/go-template": patch
---

Fix #2746/#2703: a named jsx-children prop (a JSX-valued prop other than the reserved `children`, e.g. `header={<strong>Title</strong>}`) whose value contained a template action that couldn't be baked into a static Go string was silently dropped — no struct field, no diagnostic. The bake chain (`extractTextChildren` → `extractHtmlChildren` → `extractScopedHtmlChildren`) now raises `BF101` when all three attempts fail, since named jsx-children props have no dynamic-delivery route on this adapter yet (only the reserved `children` slot does).
