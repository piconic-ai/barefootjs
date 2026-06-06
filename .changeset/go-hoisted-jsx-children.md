---
"@barefootjs/go-template": patch
---

Render hoisted `children={<…/>}` JSX on the Go template adapter, graduating the `children-jsx-expression` and `fragment-wrapped-children-jsx-expression` conformance fixtures to Hono parity.

A `children` value passed as a JSX-expression attribute (`<Box children={<span>x</span>} />`) lands as a `jsx-children` prop, and its root carries `needsScope: true`. The Go adapter previously had no path to render such a hoisted child — it was dropped, so the parent rendered an empty `<div bf-s="…"></div>`.

The adapter now treats a `jsx-children` prop as the child slot's effective children when no nested children exist, and bakes them into the child's `Children` input. Because the hoisted root's `bf-s` must resolve to the **parent** scope at render time (mirroring the client `__BF_PARENT_SCOPE__` placeholder and Mojo's begin/end capture), the bake splices the runtime parent `scopeID` into the rendered fragment (`extractScopedHtmlChildren` → `template.HTML("<span bf-s=\"" + scopeID + "\">x</span>")`) rather than emitting a static string. Genuinely dynamic fragments (surviving `{{…}}` actions) stay on the existing drop path. Hono reference snapshots are unchanged.
