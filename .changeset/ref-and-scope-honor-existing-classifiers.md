---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
---

Stop the child-component reactive-prop mirror from turning a `ref` into a DOM
attribute, and give a top-level root-is-a-child-call component a scope id to
thread into its nested `renderChild`.

Both are cases where the correct answer already existed elsewhere in the
pipeline and one path did not consult it.

**`ref` on a child-component call site (#2749).** `collectReactiveChildProps`
(`ir-to-client-js/collect-elements.ts`) decided "is this prop a DOM attribute?"
with a hand-rolled `on[A-Z]` test and no `ref` case, so a reactive `ref` prop
fell through to the generic dynamic-prop mirror and the emitted `init` ran
`__scope.setAttribute('ref', String(__v))` — the callback's SOURCE TEXT as an
attribute value. SSR never emits a `ref` attribute, so only the hydrate leg
grew one and the SSR-vs-hydrated snapshot diverged. The same prop was always
passed correctly to `initChild` as `get ref() { … }`; the runtime child then
routes it through `applyRestAttrs`, which reads `classifyDOMProp` — documented
as "the single source of truth for how should this prop reach the DOM" — gets
`kind: 'ref'` back, and invokes the callback. The mirror now reads that same
classifier and takes the same three exclusions (`ref` / `event` / `skip`) that
`applyRestAttrs` takes, so the two sides can no longer disagree. With the
attribute leak gone the callback runs; what a `ref` still cannot do is run
during SSR at all, which is the separate capability gap tracked in #2714.

**Top-level root-is-a-child-call scope (#2757).** `materializeComponent`
(`client/runtime/component.ts`) threaded `_parentScopeId` from its own
`scopeId`, or from `slot.parent`. A `comment: true` / `fragmentRoot: false`
wrapper has neither at a top-level mount: `scopeId` is null by design (the
parsed firstChild is the child's own already-scoped element, so stamping over
it would break the wrapper's own `$c` lookups) and a top-level
`createComponent(name, {})` is passed no slot. `renderChild` therefore fell
through to its "no parent known" fallback and named the child after ITSELF
(`Row_xyz_s2` where SSR and hydration both produce `Wrapper_xyz_s2`), with no
`bf-h`/`bf-m` pair. It now derives a scope id for threading only — the same
split #2722 made for a genuine fragment root, which keeps a non-null `scopeId`
purely so this threading works and skips only the attribute write. Guarded on
there being no ambient scope, so a wrapper materialized during an outer
template eval still inherits that caller's scope. A hoisted-children
`bf-s="__BF_PARENT_SCOPE__"` placeholder under such a wrapper now resolves to
that derived scope instead of stripping, which is what the Hono reference
already emitted for the same source.
