---
"@barefootjs/go-template": patch
---

Fix a prop re-forwarded through a nested child-component invocation (`<Leaf text={props.label} />` inside `Middle`, itself invoked from `Parent`) rendering EMPTY on the Go template adapter — three-level composition (Parent → Middle → Leaf) lost the threaded value at the second hop.

`emitStaticChildInstances` builds each nested child instance's `<Child>Input{...}` struct literal from the parent's own JSX attributes. A LITERAL attribute value (`<Middle label="threaded" />`) bakes straight to a Go string literal — this is why two-level composition with a literal prop already worked. A bare passthrough of the CALLER's own prop (`text={props.label}`, or the destructured form `text={label}`) is different: it's an `expression`-kind attribute value with no `.parts` (those only exist for template-literal/lookup shapes), so it fell to `resolveDynamicPropValue`, which only recognized a signal/memo getter call (`foo()`) or a `getter() === 'lit'` comparison — never a bare identifier or `props.X` member access. Neither pattern matched, so the field was silently omitted from the struct literal entirely, leaving it at Go's zero value (`""`) instead of erroring.

`resolveDynamicPropValue` now recognizes an EXACT bare `<name>` or `props.<name>` reference (no `??`/`||` fallback suffix — that isn't a pure passthrough) whose name matches one of the current component's own declared props, and resolves it to `in.<Field>` — the current component's own Input struct field for that same prop, i.e. a direct passthrough.

`grandchild-composition` graduates from a render divergence to a passing render.

Note: a SEPARATE, unrelated CSR/hydration-side divergence for this same fixture (`grandchild-composition`'s client-JS scope-id derivation reusing the parent's scope id instead of deriving its own, in `packages/adapter-tests/src/__tests__/csr-conformance.test.ts`) is NOT addressed here — this fix is scoped to the Go SSR render-divergence only.
