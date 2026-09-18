---
"@barefootjs/jsx": patch
---

The child-root prop mirror (`emitReactiveChildProps` / `emitReactivePropBindings`) no longer plants attributes the child never rendered. A reactive named prop passed to a child component call is now written onto the child's root only when that root already carries the attribute (from SSR, or from the child's own `applyRestAttrs` forwarding), so a prop the child consumes as text, a class token or data no longer appears as a stray attribute after hydration or on a client-constructed child. Props the child forwards onto its root via `{...rest}` keep updating reactively.
