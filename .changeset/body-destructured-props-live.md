---
"@barefootjs/jsx": patch
---

A body-destructured prop in props-object mode (`function Child(props) { const { value } = props; ... }`) now reads live, closing the one gap the Prop Boundary Contract series (#2931/#2932/#2933/#2936) left open. That series already made the PARAMETER-destructure form (`function Child({ value })`) reactive; the body form, syntactically equivalent, silently kept capturing its value once at mount, so an effect/memo/handler referencing it went stale and never saw a later update from the parent — with no diagnostic warning about it (BF043, which used to flag this, was retired when the parameter form was fixed since it no longer applied there).

The fix routes body-destructured bindings through the SAME live-read rewrite the parameter form already uses (`rewriteDestructuredPropReads`), rather than adding a second implementation: the captured-once alias declaration (`const value = _p.value`) is suppressed from emission entirely — not merely pruned afterward — since a scope-aware rewrite walking the init body sees any surviving top-level `const` as a real shadowing local and would otherwise silently skip every reference to it.

`children` is unaffected either way (its value is a getter that instantiates child components, so it must stay captured once), a renamed destructure (`{ n: count }`) now reads the caller-facing key live, an explicit destructure default (`{ label = 'n' }`) survives as a live `??` fallback, and a `let`-declared or later-reassigned body binding stays a real, captured, mutable local. The CSR `template:` lambda's Phase-1 default-application gap for this form is also closed, matching Hono SSR's existing behavior.
