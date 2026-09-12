---
"@barefootjs/jsx": patch
---

Fixes #2934: a pure single-prop passthrough local in a bare-props-form `"use client"` component (`function Foo(props) { const { value } = props; ... }`, or the equivalent `const value = props.value`) now reads live everywhere — plain text, `createMemo`/`createEffect` bodies, event handlers, `.map()` row bodies, and reactive attributes — the same way `props.value` and a parameter-destructured `{ value }` already did. The previous "Prop Boundary Contract" pass (#2932) fixed the parameter-destructured form only; the body form still captured its value once at the destructuring statement and never saw later updates from the parent.

Two call sites needed the fix: the compiled `init*` body's live-read rewrite (`rewriteDestructuredPropReads`'s new `rewriteBodyAliasReads` branch, `props-binding.ts`'s `resolveBodyPropAliases`) and, separately, the CSR-fresh-mount `template:` lambda (`jsx-to-ir.ts`'s `rewriteBarePropRefs`), which previously dropped a body alias's destructure DEFAULT entirely on a CSR-only mount (e.g. a new loop row, a portal) since it read the value from a type-member `ParamInfo` that carries no default of its own — now overlaid from the same `resolveBodyPropAliases` resolution.

A local that does its own computation (`const doubled = value * 2`) or is reassigned (`let`) is unaffected and stays an ordinary once-evaluated local, same as before. `children` keeps its one-time captured extraction (reading it live would re-invoke the child-instantiating getter on every access).

This also fixes two real, previously-shipped reactivity gaps surfaced by the fix: `AccordionTrigger`'s `className` and `DropdownMenuSubTrigger`'s `disabled`-derived attributes (`aria-disabled`, `tabindex`, class list) were captured at mount and never updated when the parent changed those props — both now track live.
