/**
 * Builders for the per-arm Plan types in `loop-child-arm.ts`.
 *
 * Each builder takes the relevant slice of a `LoopChildBranchSummary` plus
 * the loop-param wrap parameters, and produces a fully-resolved Plan whose
 * stringifier never touches `wrapLoopParamAsAccessor`.
 */

import type {
  ConditionalBranchEvent,
  LoopChildBranchSummary,
  LoopChildConditional,
  LoopChildEvent,
  NestedLoop,
} from '../../types'
import type {
  AttrValue,
  IRLoopChildComponent,
  IRNode,
  IRProp,
  LoopParamBinding,
} from '../../../types'
import { AttrValueOf } from '../../../types'
import { quotePropName, wrapLoopParamAsAccessor, attrValueToString } from '../../utils'
import { addCondAttrToTemplate, irChildrenToJsExpr } from '../../html-template'

/**
 * Apply a string-level expression rewriter (loop-param-accessor wrap, prop
 * rebase, etc.) to every runtime-evaluated part of an `AttrValue`. Static
 * variants (`literal`, `boolean-attr`, `boolean-shorthand`) and JSX children
 * pass through unchanged.
 *
 * Currently used by the inner-loop / branch plan builders that need to
 * rewrite `param.foo` → `param().foo` everywhere a loop iteration's prop
 * value would be evaluated.
 */
function wrapAttrValueExpression(value: AttrValue, wrap: (s: string) => string): AttrValue {
  switch (value.kind) {
    case 'literal':
    case 'boolean-attr':
    case 'boolean-shorthand':
    case 'jsx-children':
      return value
    case 'expression':
      return AttrValueOf.expression(wrap(value.expr), {
        ...(value.templateExpr !== undefined && { templateExpr: wrap(value.templateExpr) }),
        ...(value.presenceOrUndefined !== undefined && { presenceOrUndefined: value.presenceOrUndefined }),
      })
    case 'template': {
      // Collapse to an `expression` after the wrap. Template structure is
      // an SSR-adapter optimization; the inner-loop path emits client JS
      // directly so a flat string suffices.
      const flat = attrValueToString(value)
      return AttrValueOf.expression(wrap(flat ?? 'undefined'))
    }
    case 'spread':
      return AttrValueOf.spread(wrap(value.expr), value.templateExpr ? wrap(value.templateExpr) : undefined)
  }
}
import { destructureLoopParam, loopKeyFn } from '../shared'
import type {
  BranchChildComponentInit,
  BranchChildComponentInitsPlan,
  BranchEventBindingsPlan,
  BranchEventListener,
  BranchEventSlot,
  BranchInnerLoop,
  BranchInnerLoopText,
  BranchInnerLoopsPlan,
  LoopChildArmPlan,
  LoopChildConditionalPlan,
} from './loop-child-arm'

export interface BuildBranchEventBindingsArgs {
  events: readonly ConditionalBranchEvent[] | undefined
  /** Loop-param wrap closure. Identity (`x => x`) when no loop param applies. */
  wrap: (expr: string) => string
}

/**
 * Group `ConditionalBranchEvent`s by slot id (preserving declaration order)
 * and pre-wrap each handler with the supplied loop-param wrap closure. The
 * slot order matches the legacy emitter's Map-iteration shape so output
 * stays byte-identical.
 */
export function buildBranchEventBindingsPlan(
  args: BuildBranchEventBindingsArgs,
): BranchEventBindingsPlan {
  const { events, wrap } = args
  if (!events || events.length === 0) return []

  const eventsBySlot = new Map<string, BranchEventListener[]>()
  for (const ev of events) {
    let bucket = eventsBySlot.get(ev.slotId)
    if (!bucket) {
      bucket = []
      eventsBySlot.set(ev.slotId, bucket)
    }
    bucket.push({
      eventName: ev.eventName,
      wrappedHandler: wrap(ev.handler),
    })
  }

  const slots: BranchEventSlot[] = []
  for (const [slotId, listeners] of eventsBySlot) {
    slots.push({ slotId, listeners })
  }
  return slots
}

/** A loose shape for one child component inside a conditional branch IR. */
export interface BranchComponentLike {
  name: string
  slotId: string | null
  props: IRProp[]
  children?: IRNode[]
}

export interface BuildBranchChildComponentInitsArgs {
  components: readonly BranchComponentLike[]
  /** Loop-param wrap closure. Identity (`x => x`) when no loop param applies. */
  wrap: (expr: string) => string
}

/**
 * Pre-build the per-component data needed to emit `initChild` / placeholder
 * replacement lines inside a conditional branch's `bindEvents`. The selector,
 * placeholder id, and props expression are all resolved here so the
 * stringifier emits one line per entry.
 */
export function buildBranchChildComponentInitsPlan(
  args: BuildBranchChildComponentInitsArgs,
): BranchChildComponentInitsPlan {
  const { components, wrap } = args
  const inits: BranchChildComponentInit[] = []
  for (const comp of components) {
    // Per #1249, slot-attached children are addressed by the (bf-h, bf-m)
    // pair against the enclosing parent's __scopeId. The second clause is
    // a loop-body fallback: child mounts that came through `renderChild`
    // inside a mapArray callback lack bf-h (the renderItem path doesn't
    // propagate host context yet), so we accept bf-s suffix on elements
    // without bf-h. `:not([bf-h])` ensures the fallback can't reclaim a
    // sibling slot's already-bound child.
    const selector = comp.slotId
      ? `\`[bf-h="\${__scopeId}"][bf-m="${comp.slotId}"], [bf-s$="_${comp.slotId}"], [bf-s^="~${comp.name}_"]:not([bf-h])\``
      : `'[bf-s^="~${comp.name}_"], [bf-s^="${comp.name}_"]'`

    const propsEntries = comp.props
      .filter(p => p.name !== 'key')
      .map(p => {
        if (p.name.startsWith('on') && p.name.length > 2) {
          return `${quotePropName(p.name)}: ${wrap(attrValueToString(p.value) ?? 'undefined')}`
        }
        switch (p.value.kind) {
          case 'literal':
            return `get ${quotePropName(p.name)}() { return ${JSON.stringify(p.value.value)} }`
          case 'boolean-shorthand':
          case 'boolean-attr':
            return `get ${quotePropName(p.name)}() { return true }`
          case 'jsx-children':
          case 'expression':
          case 'template':
          case 'spread': {
            const expr = attrValueToString(p.value) ?? 'undefined'
            return `get ${quotePropName(p.name)}() { return ${wrap(expr)} }`
          }
        }
      })

    // Children are needed for CSR createComponent; SSR initChild ignores them
    // (text already lives in the rendered HTML).
    const childrenExpr = comp.children?.length ? irChildrenToJsExpr(comp.children) : null
    if (childrenExpr) {
      propsEntries.push(`get children() { return ${wrap(childrenExpr)} }`)
    }
    const propsExpr = propsEntries.length > 0 ? `{ ${propsEntries.join(', ')} }` : '{}'

    inits.push({
      name: comp.name,
      selector,
      placeholderId: comp.slotId || comp.name,
      propsExpr,
    })
  }
  return inits
}

export interface BuildBranchInnerLoopsArgs {
  innerLoops: readonly NestedLoop[] | undefined
  /** The variable expression naming the parent scope element (e.g. `__branchScope`). */
  scopeVar: string
  /** Outer loop param identifier (the conditional's enclosing loop). */
  outerLoopParam: string
  /** Outer loop param destructuring metadata. */
  outerLoopParamBindings?: readonly LoopParamBinding[]
  /**
   * Outer-wrap closure — defaults to wrapping with `outerLoopParam`. Overridden
   * by `emitNestedLoopChildConditionals` recursion (which threads its own wrap).
   */
  wrapOuter: (expr: string) => string
}

/**
 * Resolve the per-inner-loop data needed to emit a `mapArray` inside a
 * conditional branch. Inner-wraps every reactive expression at build time;
 * the renderItem body components / events / nested conditionals are kept as
 * inner-wrapped IR for the legacy `emitComponentAndEventSetup` /
 * `emitNestedLoopChildConditionals` until Items 2d / 2e replace them.
 */
export function buildBranchInnerLoopsPlan(
  args: BuildBranchInnerLoopsArgs,
): BranchInnerLoopsPlan {
  const {
    innerLoops,
    scopeVar,
    outerLoopParam,
    outerLoopParamBindings,
    wrapOuter,
  } = args
  if (!innerLoops || innerLoops.length === 0) return []

  const plan: BranchInnerLoop[] = []
  for (let i = 0; i < innerLoops.length; i++) {
    const inner = innerLoops[i]
    if (!inner.refsOuterParam || !inner.template) continue

    const wrapInner = (expr: string) => wrapLoopParamAsAccessor(expr, inner.param, inner.paramBindings)
    const wrapBoth = (expr: string) => wrapLoopParamAsAccessor(wrapOuter(expr), inner.param, inner.paramBindings)

    const csl = inner.containerSlotId
    // The inner loop's container element is marked with `bf="<containerSlotId>"`
    // on the host side. The fallback to a scope-id match handles the case
    // where the container IS a child component scope at that slot, addressed
    // by (bf-h, bf-m) per #1249.
    const containerExpr = csl
      ? `(${scopeVar}.querySelector('[bf="${csl}"]') ?? ${scopeVar}.querySelector(\`[bf-h="\${__scopeId}"][bf-m="${csl}"]\`) ?? ${scopeVar})`
      : scopeVar

    const { head: paramHead, unwrap: paramUnwrap } = destructureLoopParam(inner.param, inner.paramBindings)
    const wrappedKey = inner.key
      ? wrapLoopParamAsAccessor(inner.key, inner.param, inner.paramBindings)
      : null

    // Inner-wrap children IR recursively so nested component props (e.g.
    // `<Select><SelectContent>{items.map(item => ...)}` deep) all see the
    // inner accessor form.
    const wrapIRNode = (node: IRNode): IRNode => {
      if (node.type === 'component') {
        return {
          ...node,
          props: node.props.map(p => ({ ...p, value: wrapAttrValueExpression(p.value, wrapInner) })),
          children: node.children?.map(wrapIRNode),
        }
      }
      if (node.type === 'expression' && node.expr) {
        return { ...node, expr: wrapInner(node.expr) }
      }
      if ('children' in node && Array.isArray((node as { children?: IRNode[] }).children)) {
        return {
          ...node,
          children: (node as { children: IRNode[] }).children.map(wrapIRNode),
        } as IRNode
      }
      return node
    }
    const legacyComponents: IRLoopChildComponent[] = (inner.childComponents ?? []).map(comp => ({
      ...comp,
      props: comp.props.map(p => ({ ...p, value: wrapAttrValueExpression(p.value, wrapInner) })),
      children: comp.children?.map(wrapIRNode),
    }))
    const legacyEvents: LoopChildEvent[] = (inner.childEvents ?? []).map(ev => ({
      ...ev,
      handler: wrapInner(ev.handler),
    }))

    const reactiveTexts: BranchInnerLoopText[] = (inner.childReactiveTexts ?? []).map(text => ({
      slotId: text.slotId,
      wrappedExpression: wrapBoth(text.expression),
      insideConditional: !!text.insideConditional,
    }))

    plan.push({
      uidSuffix: `br_${i}`,
      markerId: inner.markerId,
      containerExpr,
      arrayExpr: wrapOuter(inner.array),
      keyFn: loopKeyFn(inner),
      paramHead,
      paramUnwrap,
      wrappedTemplate: inner.template!,
      wrappedKey,
      keyDepth: 1,
      legacyComponents,
      legacyEvents,
      reactiveTexts,
      nestedConditionals: buildLoopChildConditionalsPlan({
        conditionals: inner.childConditionals,
        scopeVar: `__belbr_${i}`,
        wrap: wrapBoth,
        loopParam: inner.param,
        loopParamBindings: inner.paramBindings,
      }),
      innerLoopParam: inner.param,
      innerLoopParamBindings: inner.paramBindings,
      outerLoopParam,
      outerLoopParamBindings,
    })
  }
  return plan
}

export interface BuildLoopChildConditionalsArgs {
  conditionals: readonly LoopChildConditional[] | undefined
  /** Element variable used as `insert(scopeVar, ...)` first arg. */
  scopeVar: string
  /** Wrap closure for condition / HTML / handlers. */
  wrap: (expr: string) => string
  /**
   * Loop param identifier — the wrap that wires the recursion's nested
   * inner loops uses this. Typically equals the inner loop's param when
   * recursion is rooted in `buildBranchInnerLoopsPlan`, or the outer loop
   * param at the top level.
   */
  loopParam: string
  /** Loop param destructuring metadata. */
  loopParamBindings?: readonly LoopParamBinding[]
}

/**
 * Build a list of `LoopChildConditionalPlan`s — the recursive Plan-tree
 * that replaces the legacy `emitNestedLoopChildConditionals` mutual
 * recursion. Each conditional pre-builds:
 *
 *   - the wrapped condition expression
 *   - the wrapped + addCondAttr'd whenTrue / whenFalse template HTML
 *   - per-arm `LoopChildArmPlan`: events / child components / inner
 *     loops / nested conditionals (recursion)
 *
 * `texts` always comes back empty — only the *outer* conditional in
 * `buildReactiveEffectsPlan` carries branch-scoped text effects.
 */
export function buildLoopChildConditionalsPlan(
  args: BuildLoopChildConditionalsArgs,
): LoopChildConditionalPlan[] {
  const { conditionals, scopeVar, wrap, loopParam, loopParamBindings } = args
  if (!conditionals || conditionals.length === 0) return []

  const plans: LoopChildConditionalPlan[] = []
  for (const cond of conditionals) {
    plans.push({
      slotId: cond.slotId,
      scopeVar,
      wrappedCondition: wrap(cond.condition),
      whenTrueTemplateHtml: addCondAttrToTemplate(wrap(cond.whenTrueHtml), cond.slotId),
      whenFalseTemplateHtml: addCondAttrToTemplate(wrap(cond.whenFalseHtml), cond.slotId),
      whenTrueArm: buildLoopChildArmPlan({
        branch: cond.whenTrue,
        wrap,
        loopParam,
        loopParamBindings,
      }),
      whenFalseArm: buildLoopChildArmPlan({
        branch: cond.whenFalse,
        wrap,
        loopParam,
        loopParamBindings,
      }),
    })
  }
  return plans
}

interface BuildLoopChildArmArgs {
  branch: LoopChildBranchSummary
  wrap: (expr: string) => string
  loopParam: string
  loopParamBindings?: readonly LoopParamBinding[]
}

function buildLoopChildArmPlan(args: BuildLoopChildArmArgs): LoopChildArmPlan {
  const { branch, wrap, loopParam, loopParamBindings } = args
  return {
    events: buildBranchEventBindingsPlan({
      events: branch.events,
      wrap,
    }),
    childComponents: buildBranchChildComponentInitsPlan({
      components: branch.childComponents,
      wrap,
    }),
    innerLoops: buildBranchInnerLoopsPlan({
      innerLoops: branch.innerLoops,
      scopeVar: '__branchScope',
      outerLoopParam: loopParam,
      outerLoopParamBindings: loopParamBindings,
      wrapOuter: wrap,
    }),
    nestedConditionals: buildLoopChildConditionalsPlan({
      conditionals: branch.conditionals,
      scopeVar: '__branchScope',
      wrap,
      loopParam,
      loopParamBindings,
    }),
    texts: [],
  }
}
