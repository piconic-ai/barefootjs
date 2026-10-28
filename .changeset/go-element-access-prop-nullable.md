---
"@barefootjs/go-template": patch
---

An optional prop read only through a literal-key element access (`props['count']`, `props?.['count']`) now gets the same nillable field as a `props.count` read. Before, an omitted `count?: number` read that way rendered `data-s="0"` and text `0` where Hono omits the attribute and renders nothing, a present `0` fell back under `??`, and `props['s']?.length` / `props['n'] !== undefined` read an omitted prop as present.
