---
"@barefootjs/go-template": patch
---

A component inside a `.map()` loop row whose body is a single child component now gets its signal- and memo-derived props at SSR, whether it is nested in that component's forwarded children (`<Chip><Mark on={highlight()}>…</Mark></Chip>`) or is the row component itself over a memo-derived list (`<Chip on={highlight()}>`). These props used to be dropped from the generated constructor, so the component rendered with the prop's zero value (for example, an attribute guarded by the prop went missing), with no diagnostic. A component nested in the forwarded children also receives props that read the row (`<Mark tone={o.tone}>`) per row instead of the zero value, and a row-independent prop there that still cannot be lowered now refuses with `BF101` instead of being dropped silently.
