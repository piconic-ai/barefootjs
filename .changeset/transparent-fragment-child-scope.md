---
'@barefootjs/client': patch
'@barefootjs/jsx': patch
---

A stateless child whose root is a transparent fragment (`<>{children}</>`) no longer gains `bf-s` / `bf-h` / `bf-m` on the client (#3355). SSR renders such a child with no scope marker at all. `renderChild()` stamped one onto the passed-through content anyway, so hydrating a conditional branch that rendered the child rewrote the server DOM, and a client-side mount diverged from SSR. The compiler now declares `transparent: true` on the child's definition, and `renderChild()` emits its markup as-is, keeping only `data-key`.
