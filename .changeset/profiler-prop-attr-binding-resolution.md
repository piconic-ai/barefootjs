---
"@barefootjs/jsx": patch
---

Profiler: resolve `#binding:<slot>` ids for prop-driven attributes (#1844 follow-up).

The compiler wraps a prop-driven attribute (``id={props.id}``,
``class={`…${props.className}`}``) in a `createEffect` and emits a
`<Component>#binding:<slot>` profiler id for it — but the debug-side graph
collector (`collectDomBindings`) only tracked signal/memo dependencies, so those
bindings were absent from `graph.domBindings` and `buildIdIndex` had no node for
them. The effect then showed as `(unresolved)` in `bf debug profile` even though
the id was prefixed with the component's own name (e.g. `Slider#binding:s2`,
`Accordion#binding:s0`, and imported children like `CheckIcon#binding:s0`).

`collectDomBindings` now detects prop references on attribute expressions,
mirroring the emitter's `needsEffectWrapper` prop gate exactly (prop names as
lexer-aware bare identifiers plus the `<propsObject>.x` member pattern, both
excluding `children`). Such bindings carry no signal/memo `deps`, so fan-out and
subscription counts are unchanged — only the previously-missing source
attribution is added. A `PropAttr` shape is added to the SR4 coverage-conformance
matrix so the emit↔analyzer symmetry is guarded against regression.
