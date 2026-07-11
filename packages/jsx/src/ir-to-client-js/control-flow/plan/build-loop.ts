/**
 * Build `LoopPlan` from a `TopLevelLoop` IR node (#1253).
 *
 * `buildLoopPlan` is the single entry point. It dispatches to a private
 * per-variant builder via the decision tree documented inline. Per-variant
 * builders are exported with `@internal` JSDoc — only the unified entry
 * should be consumed by emit code.
 *
 * Classification predicates (in evaluation order):
 *
 *   1. `isStaticArray` → `'static'`
 *   2. dynamic + (`nestedComponents` or `innerLoops`) under
 *      `useElementReconciliation` → `'composite'`
 *   3. dynamic + `childComponent` → `'component'`
 *   4. fallthrough → `'plain'`
 *
 * The branch composite plan (built by `buildBranchCompositePlan`) intentionally
 * lives in `build-composite-loop.ts` — it takes `BranchLoop`, not
 * `TopLevelLoop`, and is reused by the branch-loop wrapper plan.
 */

import type {
  TopLevelLoop,
  LoopChildReactiveAttr,
} from '../../types.ts'
import {
  buildChainedArrayExpr,
  buildLoopChildIndexExpr,
  setIntersects,
  varSlotId,
  wrapLoopParamAsAccessor,
} from '../../utils.ts'
import {
  loopKeyFn,
  destructureLoopParam,
  buildChildRefBindings,
  buildStaticChildRefBindings,
} from '../shared.ts'
import { buildLoopReactiveEffectsPlan } from './build-reactive-effects.ts'
import { buildComponentLoopPlan } from './build-component-loop.ts'
import { buildTopLevelCompositePlan } from './build-composite-loop.ts'
import type {
  LoopPlan,
  PlainLoopPlan,
  StaticLoopMaterializePlan,
  StaticLoopPlan,
} from './types.ts'

/** Inputs only the static-array variant consumes. */
export interface BuildLoopPlanOptions {
  /** Local names whose CSR-time substitution forces the static-array self-heal path (#1247). */
  unsafeLocalNames: Set<string>
  /** Owning component name when compiling in profile mode (#1690) — else undefined. */
  profileComponentName?: string
}

/**
 * The single public builder. Selects the variant via the decision tree
 * described above and returns the discriminated `LoopPlan`.
 */
export function buildLoopPlan(elem: TopLevelLoop, opts: BuildLoopPlanOptions): LoopPlan {
  // Whole-item conditional bodies (#1665) render 0-or-1 element per item, so
  // they need anchored `mapArrayAnchored` emission regardless of whether the
  // array is static or dynamic. Routing both through the plain (anchored)
  // path keeps `const arr` and `signal()` behaviour identical — a static
  // array's per-item conditional still toggles reactively instead of freezing
  // in the SSR-time `forEach` (which has no conditional handling at all).
  if (elem.bodyIsItemConditional) {
    return buildPlainLoopPlan(elem, opts.profileComponentName)
  }
  if (elem.isStaticArray) {
    return buildStaticLoopPlan(elem, opts.unsafeLocalNames, opts.profileComponentName)
  }
  const hasInnerStructure = (elem.nestedComponents?.length ?? 0) > 0
    || (elem.innerLoops?.length ?? 0) > 0
  if (elem.useElementReconciliation && hasInnerStructure) {
    return buildTopLevelCompositePlan(elem, opts.profileComponentName)
  }
  if (elem.childComponent) {
    return buildComponentLoopPlan(elem, opts.profileComponentName)
  }
  return buildPlainLoopPlan(elem, opts.profileComponentName)
}

/** @internal — prefer `buildLoopPlan`. Exported for the branch-loop wrapper only. */
export function buildPlainLoopPlan(elem: TopLevelLoop, profileComponentName?: string): PlainLoopPlan {
  const wrap = (expr: string) => wrapLoopParamAsAccessor(expr, elem.param, elem.paramBindings)
  const { head: paramHead, unwrap: paramUnwrap } = destructureLoopParam(elem.param, elem.paramBindings)
  const hasReactive = elem.bindings.reactiveAttrs.length > 0
    || elem.bindings.reactiveTexts.length > 0
    || elem.bindings.conditionals.length > 0

  return {
    kind: 'plain',
    containerVar: `_${varSlotId(elem.slotId)}`,
    markerId: elem.markerId,
    profileLoopId: profileComponentName ? `${profileComponentName}#binding:${elem.slotId}` : undefined,
    arrayExpr: buildChainedArrayExpr(elem),
    keyFn: loopKeyFn(elem),
    paramHead,
    paramUnwrap,
    indexParam: elem.index || '__idx',
    mapPreambleWrapped: elem.mapPreamble ? wrap(elem.mapPreamble) : '',
    template: elem.template,
    skeletonTemplate: elem.skeletonTemplate,
    skeletonPaths: elem.skeletonPaths,
    reactiveEffects: hasReactive ? buildLoopReactiveEffectsPlan(elem, profileComponentName) : null,
    childRefs: buildChildRefBindings(elem.bindings.refs, elem.param, elem.paramBindings),
    bodyIsMultiRoot: elem.bodyIsMultiRoot ?? false,
    anchored: elem.bodyIsItemConditional ?? false,
    // Fall back to the iteration index when the loop has no key. A whole-item
    // conditional without a key is a BF023 error, but the emitted client JS
    // must still parse — an empty `anchorKeyExpr` would produce
    // `createComment(`bf-loop-i:${}`)` (a SyntaxError that breaks the whole
    // bundle). `elem.index || '__idx'` matches `indexParam` above, so the
    // anchor value stays consistent with the renderItem's own index param.
    anchorKeyExpr: elem.key ? wrap(elem.key) : (elem.index || '__idx'),
  }
}

/** @internal — prefer `buildLoopPlan`. */
export function buildStaticLoopPlan(elem: TopLevelLoop, unsafeLocalNames: Set<string>, profileComponentName?: string): StaticLoopPlan {
  // Group reactive attrs by their child slot id, preserving the legacy
  // declaration-order Map-iteration semantics.
  const attrsBySlotMap = new Map<string, LoopChildReactiveAttr[]>()
  if (!elem.childComponent) {
    for (const attr of elem.bindings.reactiveAttrs) {
      let bucket = attrsBySlotMap.get(attr.childSlotId)
      if (!bucket) {
        bucket = []
        attrsBySlotMap.set(attr.childSlotId, bucket)
      }
      bucket.push(attr)
    }
  }

  const indexParam = elem.index || '__idx'
  const childIndexExpr = buildLoopChildIndexExpr(indexParam, elem.offset)

  return {
    kind: 'static',
    containerVar: `_${varSlotId(elem.slotId)}`,
    arrayExpr: elem.array,
    param: elem.param,
    indexParam,
    childIndexExpr,
    profileComponentName,
    attrsBySlot: [...attrsBySlotMap].map(([slotId, attrs]) => [slotId, attrs] as const),
    texts: elem.bindings.reactiveTexts,
    // Static path: forEach binds `param` as the raw value. Passing through
    // the signal-accessor wrap would rewrite e.g. `it.id` → `it().id` and
    // throw at runtime. Mirrors how `texts` are already handled above.
    childRefs: buildStaticChildRefBindings(elem.bindings.refs),
    csrMaterialize: buildStaticLoopMaterialize(elem, unsafeLocalNames),
  }
}

/**
 * Decide whether the CSR template will substitute the loop's array with `[]`
 * (the unsafe-name fallback in `html-template.ts`) and, if so, package the
 * inputs the stringifier needs to clone per-iteration children into the
 * container at hydrate time (#1247, #1268).
 *
 * Skipped when:
 *   - there are no init-scope locals (the CSR template never substitutes),
 *   - the per-iteration template wasn't built (cannot reproduce content), or
 *   - the array is safe in template scope (the CSR template already emits
 *     items via `.map(...)`, no fallback needed).
 *
 * Body shape handling: the per-iteration template carries `${renderChild(...)}`
 * expressions for component bodies (plain element, single-child-component, and
 * composite-with-nested-components paths alike). The clone-and-insert branch
 * in `stringifyStaticLoop` evaluates them when constructing the template's
 * `innerHTML`, so the cloned children land with the SSR `bf-s` shape and
 * `static-array-child-inits` can wire them via `initChild` unchanged.
 *
 * Note: `useElementReconciliation` is forced to `false` for static arrays in
 * `decideLoopRendering`, so no explicit exclusion is needed for that flag —
 * the composite-with-nested-components case takes the plain-element template
 * path with renderChild expressions inlined.
 */
function buildStaticLoopMaterialize(
  elem: TopLevelLoop,
  unsafeLocalNames: Set<string>,
): StaticLoopMaterializePlan | null {
  if (unsafeLocalNames.size === 0) return null
  if (!elem.staticItemTemplate) return null
  if (!setIntersects(elem.arrayFreeIdentifiers, unsafeLocalNames)) return null
  return {
    itemTemplate: elem.staticItemTemplate,
    mapPreamble: elem.mapPreamble ?? '',
    bodyIsMultiRoot: elem.bodyIsMultiRoot ?? false,
  }
}
