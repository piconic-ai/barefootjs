---
"@barefootjs/jsx": patch
---

Fix #2716: a reactive `value` prop/attribute unconditionally wrote the live `.value` DOM IDL property, even onto elements that aren't form controls — most visibly a child component's root `<div>` reactively mirroring a parent-passed `value` prop (e.g. `<ReactiveChild value={count()} />`). SSR never renders a `.value` property, so hydration silently planted an expando the server-rendered DOM never had — a hydrated/SSR DOM-state divergence, and a hazard for any code that duck-types form controls via `'value' in el`.

The write is now gated at runtime to genuine form controls (input/textarea/select/option, the controlled-value contract) via the same `'value' in target` check `applyRestAttrs` already used for its own rest-spread handling. A developer-authored `value=` attribute on a plain element (SSR already renders it) falls back to a plain attribute write; the child-root prop MIRROR (`emitReactivePropBindings`/`emitReactiveChildProps`, which has no SSR-rendered counterpart at all) writes nothing on a non-form-control root instead, matching what SSR rendered there.
