---
"@barefootjs/jsx": patch
---

A const read through a method call on another inlinable const (`const text = props.label ?? 'd'; const upper = text.toUpperCase()`) now inlines into the CSR template as `(_p.label ?? 'd').toUpperCase()` on an adapter that accepts template calls (Hono). It no longer reports BF061 or falls back to `undefined`.
