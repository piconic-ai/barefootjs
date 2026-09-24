/**
 * Component-root scope comment (#3141): decide, EXACTLY ONCE and right after
 * `metadata.clientAnalysis` becomes available, whether a client-interactive
 * component's render ROOT — when that root is itself a single child-
 * component call with no wrapping element of its own — needs a comment-based
 * scope marker pair around its rendered output.
 *
 * Before this, the decision was answered independently by Hono
 * (`isRootComponent` + `wrapWithScopeComment` in `hono-adapter.ts`) and NOT
 * AT ALL by the eight DSL adapters, which only ever wrap a `needsScopeComment`
 * FRAGMENT root (the analogous multi-element-root case) — go-template alone
 * had a partial, adapter-local re-derivation that emitted the opening marker
 * but not the closing one. That's the "one decision, two implementations"
 * defect CLAUDE.md calls out: this function is the single shared answer
 * every adapter's `IRNodeEmitter.emitComponent` now reads off
 * `IRComponent.needsScopeComment` instead of re-deriving.
 *
 * Mirrors `IRFragment.needsScopeComment`, computed inside `jsx-to-ir.ts`'s
 * `transformFragment` at parse time — but THIS flag can't live there: "is
 * this component client-interactive" isn't knowable until
 * `analyzeClientNeeds` has run over the whole IR, which happens in
 * `compiler.ts` after `jsxToIR` returns. So, like Slot Unification Step B's
 * `decideClientOnlyElision`, this is a post-hoc mutation of the already-built
 * IR, run once, before any adapter or `generateClientJs` sees it.
 */

import type { ComponentIR, IRComponent } from './types.ts'

/**
 * True when `ir`'s render root needs the comment-based scope marker pair:
 * the root is a single component call (no wrapping element) AND the
 * component is client-interactive (owns a `'use client'` directive, or the
 * client-JS pre-pass determined it needs an init call regardless).
 *
 * Matches the Hono reference's existing `hasClientInteractivity` formula
 * exactly (`isClientComponent || needsInit`) — this function REPLACES that
 * adapter-local computation for the one decision it fed (the scope-comment
 * wrap), not the adapter's other, still-adapter-owned uses of the same two
 * inputs (namespaced prop passthrough to the child, `bf-p` presence).
 */
function needsComponentRootScopeComment(ir: ComponentIR): boolean {
  if (ir.root.type !== 'component') return false
  const hasClientInteractivity =
    ir.metadata.isClientComponent || (ir.metadata.clientAnalysis?.needsInit ?? false)
  return hasClientInteractivity
}

/**
 * Mutate `ir.root` in place, marking it `needsScopeComment: true` when
 * `needsComponentRootScopeComment` says so. A no-op otherwise (including
 * when the root isn't a `component` node at all) — mirrors
 * `decideClientOnlyElision`'s in-place-mutation convention so both
 * `compileMultipleComponents` and the single-component path can call it
 * identically right after `metadata.clientAnalysis` is set.
 */
export function decideComponentRootScopeComment(ir: ComponentIR): void {
  if (!needsComponentRootScopeComment(ir)) return
  ;(ir.root as IRComponent).needsScopeComment = true
}
