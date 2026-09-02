---
"@barefootjs/go-template": patch
---

Fix #2703: a named jsx-children prop (a JSX-valued prop other than the reserved `children`, e.g. `header={<strong>Title</strong>}`) whose value couldn't be baked into a static Go string now renders correctly instead of refusing with `BF101` — the dynamic-delivery route the reserved `children` slot already had (`bf_with_props` + `bf_tmpl` companion defines) is extended to named props.
