/**
 * Build `ComponentLoopPlan` from a `TopLevelLoop` IR node whose body is a
 * single child component (with optional nested child components).
 *
 * The plan resolves all stringification decisions up-front:
 *   - props expression for the outer component and each nested component
 *   - selector to find the SSR-rendered nested component
 *   - whether each nested component's children should reactive-update via
 *     `createEffect` based on text-only-and-references-loop-param detection
 *   - the wrapped key argument for `createComponent(name, props, KEY)`
 *   - a fully resolved `ReactiveEffectsPlan` for `childConditionals`
 */

import type { TopLevelLoop } from '../../types.ts'
import type { IRNode } from '../../../types.ts'
import {
  buildChainedArrayExpr,
  varSlotId,
  wrapLoopParamAsAccessor,
  irChildrenFreeIds,
} from '../../utils.ts'
import {
  loopKeyFn,
  destructureLoopParam,
  buildComponentPropsExpr,
  buildCompSelector,
  isTextOnlyConditional,
  buildChildRefBindings,
  hasReactiveLoopBindings,
  buildChildrenTextEffect,
} from '../shared.ts'
import { irChildrenToJsExpr, renderPreamble } from '../../html-template.ts'
import { buildReactiveEffectsPlan } from './build-reactive-effects.ts'
import type { ComponentLoopPlan, NestedComponentInit } from './types.ts'
import { internalInvariant } from '../../../errors.ts'

/**
 * Collect the `slotId` of every `expression` leaf reachable through
 * `nodes` — recursing only through `text`/`expression`/text-only
 * `conditional` nodes, mirroring exactly the shape `isTextOnlyConditional`
 * validates. Used to find which of a component-root loop's own
 * `elem.bindings.reactiveTexts` entries (collected via the generic,
 * depth-unaware `collectLoopChildBindings` walk — see the comment below)
 * are already patched by a NESTED child component's `childrenTextEffect`,
 * so the row-level wiring doesn't ALSO patch them (#3143 follow-up: two
 * independent effects racing to write — and, before #3064's marker-aware
 * patch, one destroying the other's `<!--bf:^sN-->` markers outright —
 * caught by `update-expected-html` fixture drift on `data-table`, whose
 * `TableRow` loop forwards `<TableCell>{payment.id}</TableCell>` nested
 * components).
 */
function collectTextOnlySlotIds(nodes: readonly IRNode[], into: Set<string>): void {
  for (const node of nodes) {
    if (node.type === 'expression') {
      if (node.slotId) into.add(node.slotId)
    } else if (node.type === 'conditional' && isTextOnlyConditional(node)) {
      collectTextOnlySlotIds([node.whenTrue, node.whenFalse], into)
    }
  }
}

/** @internal — prefer `buildLoopPlan`. */
export function buildComponentLoopPlan(elem: TopLevelLoop, profileComponentName?: string): ComponentLoopPlan {
  const { name } = elem.childComponent!
  const propsExpr = buildComponentPropsExpr(elem.childComponent!, elem.param, undefined, elem.index)
  const keyExpr = wrapLoopParamAsAccessor(elem.key || '__idx', elem.param, elem.paramBindings, elem.index)
  const { head: paramHead, unwrap: paramUnwrap } = destructureLoopParam(elem.param, elem.paramBindings)

  // A component-root loop's preamble is JS-only by construction: Phase 1
  // (jsx-to-ir.ts) already refuses and strips any preamble with a JSX leaf
  // (`builderNames.length > 0`) on this shape, because a lowered HTML-string
  // leaf passed as a prop would diverge from SSR's real JSX elements — see
  // `rowConstruction: 'dom-ops'` below. `renderLeaf` is therefore never
  // reachable here; if it ever fires, a Phase-1 refusal for the new shape
  // that let a JSX-bearing preamble through is missing, not this line.
  const mapPreambleWrapped = elem.preamble
    ? renderPreamble(elem.preamble, {
        transformJs: text => wrapLoopParamAsAccessor(text, elem.param, elem.paramBindings, elem.index),
        renderLeaf: () => {
          internalInvariant(false, 'component-root loop received a JSX-bearing preamble — Phase 1 should have refused it')
        },
      })
    : ''

  // Only init components at loopDepth 0 — inner-loop components are handled by their own loop
  const outerNestedComps = (elem.nestedComponents ?? []).filter(c => !c.loopDepth)
  const wrap = (expr: string) => wrapLoopParamAsAccessor(expr, elem.param, elem.paramBindings, elem.index)
  // Slot ids already patched by a nested component's OWN `childrenTextEffect`
  // below — collected up front so the row-level reactive-texts wiring further
  // down can exclude them (see the comment on that filter for why).
  const nestedChildrenTextEffectSlotIds = new Set<string>()
  const nestedComps: NestedComponentInit[] = outerNestedComps.map(comp => {
    const isTextOnly = comp.children?.length
      ? comp.children.every(c => c.type === 'expression' || c.type === 'text' || isTextOnlyConditional(c))
      : false
    const rawChildrenExpr = isTextOnly ? irChildrenToJsExpr(comp.children!) : null
    const childrenFreeIds = isTextOnly && comp.children ? irChildrenFreeIds(comp.children) : undefined
    const childrenRefsLoop = rawChildrenExpr != null && childrenFreeIds != null
      && (childrenFreeIds.has(elem.param) || (!!elem.index && childrenFreeIds.has(elem.index)))
    if (childrenRefsLoop && comp.children) {
      collectTextOnlySlotIds(comp.children, nestedChildrenTextEffectSlotIds)
    }
    return {
      componentName: comp.name,
      selector: buildCompSelector(comp),
      propsExpr: buildComponentPropsExpr(comp, elem.param, undefined, elem.index),
      // #3064: marker-scoped where possible — see `buildChildrenTextEffect`.
      childrenTextEffect: childrenRefsLoop
        ? buildChildrenTextEffect(comp.children!, rawChildrenExpr!, wrap)
        : null,
    }
  })

  // #3143: a component-root loop's own reactive attrs/texts — collected via
  // `collectLoopChildBindings` into `elem.bindings` the same way as every
  // other loop shape (`collect-elements.ts`'s `loop:` visitor calls it
  // unconditionally) — used to be silently dropped here: this builder only
  // ever read `elem.bindings.conditionals`, never `.reactiveAttrs` /
  // `.reactiveTexts`. Those two collectors DO reach a forwarded element
  // inside the root component's own `<Chip>...</Chip>` JSX-children body
  // (`traverseElements`'s default `walkIR` descent into an `IRComponent`
  // node's `.children` — no `component:` visitor override needed, unlike
  // the JSX-children PROP form), so the bindings were computed and then
  // thrown away. Routing them through the same `ReactiveEffectsPlan` the
  // conditionals already used fixes it — see `stringifyComponentLoop`'s
  // gate, widened alongside this to actually emit the effects on the
  // no-nested-components ("simple") path too.
  //
  // The SAME depth-unaware collector also reaches text expressions that
  // are a NESTED component's own children (`<TableRow><TableCell>
  // {payment.id}</TableCell></TableRow>`) — those already get their own
  // patch via `nestedComps[].childrenTextEffect` above, so wiring them
  // AGAIN here would emit two independent effects for the same slot (see
  // `collectTextOnlySlotIds`'s doc comment). Filtered out before either
  // the presence check or the plan itself sees them.
  const rowReactiveTexts = nestedChildrenTextEffectSlotIds.size > 0
    ? elem.bindings.reactiveTexts.filter(t => !nestedChildrenTextEffectSlotIds.has(t.slotId))
    : elem.bindings.reactiveTexts
  const hasReactiveEffects = hasReactiveLoopBindings({ ...elem.bindings, reactiveTexts: rowReactiveTexts })

  return {
    kind: 'component',
    // Rows are createComponent-driven: a lowered HTML-string leaf passed as a
    // prop would diverge from SSR (which passes real JSX elements). The plan
    // dispatcher refuses a JSX-bearing preamble on this variant.
    rowConstruction: 'dom-ops',
    mapPreambleWrapped,
    containerVar: `_${varSlotId(elem.slotId)}`,
    markerId: elem.markerId,
    arrayExpr: buildChainedArrayExpr(elem),
    keyFn: loopKeyFn(elem),
    paramHead,
    paramUnwrap,
    indexParam: elem.index || '__idx',
    componentName: name,
    componentPropsExpr: propsExpr,
    keyExpr,
    nestedComps,
    // Refs on a component element (`<Comp ref={fn} />`) are not currently
    // wired here — the body root is the component, not a DOM element, so
    // the per-item factory has no `__el` handle to invoke. Still required
    // by the type so the structural invariant (every variant has a
    // `childRefs`) is preserved; populated as empty.
    childRefs: buildChildRefBindings(elem.bindings.refs, elem.param, elem.paramBindings, elem.index),
    profileLoopId: profileComponentName ? `${profileComponentName}#binding:${elem.slotId}` : undefined,
    reactiveEffects: hasReactiveEffects
      ? buildReactiveEffectsPlan({
          attrs: elem.bindings.reactiveAttrs,
          texts: rowReactiveTexts,
          conditionals: elem.bindings.conditionals,
          loopParam: elem.param,
          loopParamBindings: elem.paramBindings,
          loopIndex: elem.index,
          profileComponentName,
        })
      : null,
  }
}
