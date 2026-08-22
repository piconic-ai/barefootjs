---
"@barefootjs/jsx": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/blade": patch
"@barefootjs/twig": patch
"@barefootjs/rust": patch
"@barefootjs/xslate": patch
"@barefootjs/go-template": patch
---

The #2669 self-derivation fix now sees THROUGH a component-scope `const` sitting between a signal/memo's initializer and the prop it derives from, closing the gap found in review

```tsx
'use client'
import { createSignal } from '@barefootjs/client'
export function C(props: { label?: string }) {
  const mid = props.label
  const [label, setLabel] = createSignal(mid ?? 'Default')
  return <span>{label()}</span>
}
```

#2669's fix (`referencesOwnProp` in `packages/jsx/src/ssr-defaults.ts`) only recognized a DIRECT `props.<name>` access in the initializer expression. One hop of pure indirection defeated it on both sides of the pipeline:

- **Manifest**: `collectPropRefs` (both the self-derivation check and the bare-props-arg safety net that seeds a prop a signal/memo initializer reads, #1297/#2126) never looked through a local `const` — the `label` entry lost `propName` and fell back to `{ value: 'Default' }`, so a caller-supplied `label='Hello'` could never win.
- **Template**: even with `propName` restored, `computeSsrSeedPlan` (`packages/jsx/src/ssr-seed-plan.ts`) classified the signal as `opaque` because `mid` (a component-scope const) wasn't part of its `baseScope` — no adapter emitted an in-template recompute at all, so an absent prop rendered permanently empty instead of falling back to `'Default'`.

Both now resolve transitively through any chain of component-scope `const` locals (`collectPropRefsTransitive` on the manifest side; `resolveThroughLocalConsts`, reusing the same structural `inlineBinding` let-inline step `foldBlockToExpr` already performs for a block-bodied memo's own locals, on the seed-plan side) — never string splicing, per this repo's write-side rule. The seed-plan fix lives in the shared `computeSsrSeedPlan`, so every template-stash adapter's existing self-referencing-lowering handling (Jinja/Twig/Blade/Rust's re-read-before-reassign `{% set %}` semantics, Xslate's capture-before-shadow `: my $__bf_seed_*` lowering) picks it up with no adapter-side changes.

**go-template**: the manifest/seed-plan fix applies equally, but the pre-existing #2683 props-struct field-name-collision bug (keyed on the signal's name colliding with its prop field, independent of how the initializer reaches that prop) still drops the derivation for the non-idempotent via-const shape — pinned in `render-divergences.ts` alongside the direct-access form #2683 already covers.
