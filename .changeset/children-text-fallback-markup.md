---
"@barefootjs/jsx": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
---

A read of the component's own `children` prop with a text fallback keeps present children as markup. In the client template, `{children ?? 'fallback'}` and `{(children ?? '<b>x</b>') ?? ''}` used to escape the whole read, so passed children rendered as visible `&lt;span&gt;` text; now the children are spliced as markup and only the fallback is escaped. `{children || 'fallback'}` gets the same treatment in the client template and in ERB, which escaped present children the same way. On Go templates, a fixture for a children prop renamed in the parameter destructure (`{ children: kids }`) is pinned as a known divergence: present children are dropped there.
