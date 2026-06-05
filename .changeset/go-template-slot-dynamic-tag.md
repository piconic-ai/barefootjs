---
"@barefootjs/go-template": patch
"@barefootjs/jsx": patch
---

Render the `Slot` component's runtime-chosen dynamic tag (`const Tag =
children.tag`) as a children passthrough in the Go template adapter
instead of an impossible `{{template "Tag"}}` call, which Go's
`html/template` rejected (`no such template "Tag"`) while escape-walking
all registered templates. This lets components that use the `asChild` /
`Slot` pattern (e.g. `Button`) be registered and rendered server-side on
the Go adapter. A new additive `IRComponent.dynamicTag` flag marks the
node; it is consumed only by the Go adapter (Hono/CSR/Mojo ignore it).
Also fixes two latent Go-adapter divergences surfaced by this path. The
`isValidElement(x)` element guard now lowers to a real server-side
truthiness check (an element is renderable when there is markup to emit)
instead of a bogus `.IsValidElement` field access; any other user-defined
predicate call in a condition (e.g. `isAdmin(user)`), which a server-side
template genuinely cannot evaluate, now refuses with a hard `BF102` error
pointing to `/* @client */` rather than silently rendering a gated branch.
And `Record<T,string>` case values in template-literal lookups are
HTML-escaped to match the reference output.
