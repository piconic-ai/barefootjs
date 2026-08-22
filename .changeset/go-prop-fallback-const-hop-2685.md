---
"@barefootjs/go-template": patch
---

Fix `go-template`'s props-struct field-default baking for a signal initialized through a component-scope `const` hop from a same-named prop:

```tsx
'use client'
import { createSignal } from '@barefootjs/client'
export function C(props: { label?: string }) {
  const mid = props.label
  const [label, setLabel] = createSignal(mid ?? 'Default')
  return <span>{label()}</span>
}
```

An absent `label` prop rendered empty instead of falling back to `'Default'` — the direct form (`createSignal(props.label ?? 'Default')`) already worked (#2669/#2683), but the const hop defeated it on go-template specifically, even after `#2685`'s `computeSsrSeedPlan` fix (`resolveThroughLocalConsts` in `packages/jsx/src/ssr-seed-plan.ts`) taught the shared seed plan to see through the hop.

The remaining gap was go-template-side: `extractPropFallbackFromParsed` (structural `props.X ?? <literal>` recognizer feeding the props-struct constructor's field-default baking) and `collectNullishConsumedPropNames`'s signal-seed loop (decides whether the field needs the `interface{}` nil-vs-zero-value flip, #2248) both matched against the signal's own best-effort `parsed` tree — `mid ?? 'Default'` — never the const-inlined form `computeSsrSeedPlan` already computes and attaches at `ir.metadata.ssrSeedPlan`. `mid` is a bare identifier, not `props.<name>`, so both matchers silently declined and the field kept Go's `""` zero value.

Fixed by threading the seed plan's already-const-hop-inlined `ParsedExpr` (its `derived` step for the signal) through both matchers instead of the signal's raw `parsed` — a single shared `resolveSignalParsedThroughSeedPlan` helper (`packages/adapter-go-template/src/adapter/lib/compile-state.ts`) so the two matchers can't drift from each other again. Fixing only the fallback-var extraction and not the nullish-consumed classification left the two disagreeing on the const-hop shape: the field-default baked in correctly for an ABSENT prop, but the field stayed a concrete (non-`interface{}`) Go string, so the fallback's zero-value conflation (an accepted trade-off for the direct form's own field, where `interface{}` already made "absent" distinguishable from an explicit `""`) newly swallowed an EXPLICIT empty-string prop into the const's default too. Both matchers now resolve identically, so the const-hop shape gets the same nil-vs-zero-value handling as the direct form.

The `-derived` (non-idempotent, self-referencing) sibling shapes stay pinned per #2683/#2684 — this fix is scoped to the idempotent const-hop fold only.
