import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: "A nested child's own text position loses its SSR slot marker when the caller passes it a static literal",
  given:
    "a `'use client'` component that renders an incoming prop directly as its own JSX text content (not `props.children`), e.g. `{props.placeholder ?? ''}`, while ALSO overwriting that same text imperatively from a `ref`/mount effect driven by something other than that prop (a `useContext` read) — nested as a child of a sibling `'use client'` component that passes it a plain string literal for that prop (`<ComboboxValue placeholder=\"Select framework...\" />`)",
  expected:
    "the server HTML and the hydrated DOM carry the same `<!--bf:sN-->…<!--/-->` slot marker pair around the text, matching the child component's own compiled client template (which always wraps this position, since the child's OWN client init code treats it as patchable)",
  actual:
    "omits the slot markers at that nested-child SSR position, rendering a bare text string instead — the caller's literal argument reads as proof the position never changes, which only accounts for the PROP's own reactivity, not the child's independent internal effect that also writes to the same node — while the client hydration template unconditionally wraps the position in markers regardless of caller context, so hydration inserts a marker pair with no matching SSR structure, a permanent structural mismatch rather than a value change",
  fixtures: ['combobox', 'select'],
})
