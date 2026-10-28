/**
 * Static child-instance collection (#3425): which child components get a
 * `.<Name>SlotN` field (and a constructor init) on the parent's Props struct.
 *
 * - {@link collectStaticChildInstances} walks a component's IR tree for the
 *   static (non-loop) child instances the constructor builds once per slot.
 * - {@link collectBodyChildInstances} walks a loop-body component's forwarded
 *   children for the instances its wrapper struct carries.
 *
 * Both run the same recursive walk ({@link collectStaticChildInstancesRecursive})
 * over a {@link StaticChildrenHost}; the adapter's type and constructor
 * generation call them.
 */

import {
  BindingScope,
  type IRAsync,
  type IRComponent,
  type IRConditional,
  type IRElement,
  type IRFragment,
  type IRIfStatement,
  type IRLoop,
  type IRNode,
  type IRProvider,
} from '@barefootjs/jsx'
import { resolveJsxChildrenProp } from '@barefootjs/shared'

import type { GoEmitContext } from '../emit-context.ts'
import { slotIdToFieldSuffix } from '../lib/go-naming.ts'
import type { StaticChildInstance } from '../lib/types.ts'

/**
 * What the static child-instance collection needs from the adapter beyond the
 * shared {@link GoEmitContext}: the children bake extractors (which render
 * through the adapter) and the provider-context lowering. Kept out of
 * `GoEmitContext` because only this module reads them.
 */
export interface StaticChildrenHost {
  readonly ctx: GoEmitContext
  /** The concatenated text of all-text children, else null. */
  extractTextChildren(children: IRNode[]): string | null
  /** The rendered HTML of purely static, non-text children, else null. */
  extractHtmlChildren(children: IRNode[]): string | null
  /** The Go string-concat expression of hoisted children with a parent-scope root, else null. */
  extractScopedHtmlChildren(children: IRNode[]): string | null
  /** Extend the active provider-context map with one `<Ctx.Provider value>`. */
  extendProviderContext(
    current: ReadonlyMap<string, string>,
    p: IRProvider,
    propsParams: ReadonlyArray<{ name: string }>,
  ): ReadonlyMap<string, string>
}

/**
 * Collect all static child component instances from the IR tree. Excludes
 * components inside loops (handled by nestedComponents). Each instance carries
 * its component `name`, `slotId`, `props`, and Go `fieldName`.
 */
export function collectStaticChildInstances(
  host: StaticChildrenHost,
  node: IRNode,
  propsParams: ReadonlyArray<{ name: string }> = [],
): Array<StaticChildInstance> {
  const result: StaticChildInstance[] = []
  collectStaticChildInstancesRecursive(host, node, result, false, new Map(), propsParams)
  return result
}

/**
 * Collect static child instances from loop body children for the wrapper
 * struct. `rowScope` is the loop-body component's own row scope
 * (`NestedComponentInfo.rowScope`), so each instance's `rowScope` covers
 * the row it is forwarded into as well as any loop nested below it.
 */
export function collectBodyChildInstances(
  host: StaticChildrenHost,
  bodyChildren: IRNode[],
  propsParams: ReadonlyArray<{ name: string }> = [],
  rowScope: BindingScope = BindingScope.EMPTY,
): StaticChildInstance[] {
  const result: StaticChildInstance[] = []
  for (const child of bodyChildren) {
    collectStaticChildInstancesRecursive(host, child, result, false, new Map(), propsParams, rowScope)
  }
  return result
}

function collectStaticChildInstancesRecursive(
  host: StaticChildrenHost,
  node: IRNode,
  result: StaticChildInstance[],
  inLoop: boolean,
  providerCtx: ReadonlyMap<string, string>,
  propsParams: ReadonlyArray<{ name: string }> = [],
  scope: BindingScope = BindingScope.EMPTY,
): void {
  if (node.type === 'component') {
    collectComponentInstances(host, node as IRComponent, result, inLoop, providerCtx, propsParams, scope)
  } else if (node.type === 'loop') {
    collectLoopInstances(host, node as IRLoop, result, inLoop, providerCtx, propsParams, scope)
  } else if (node.type === 'element') {
    const element = node as IRElement
    for (const child of element.children) {
      collectStaticChildInstancesRecursive(host, child, result, inLoop, providerCtx, propsParams, scope)
    }
  } else if (node.type === 'fragment') {
    const fragment = node as IRFragment
    for (const child of fragment.children) {
      collectStaticChildInstancesRecursive(host, child, result, inLoop, providerCtx, propsParams, scope)
    }
  } else if (node.type === 'conditional') {
    const cond = node as IRConditional
    collectStaticChildInstancesRecursive(host, cond.whenTrue, result, inLoop, providerCtx, propsParams, scope)
    if (cond.whenFalse) {
      collectStaticChildInstancesRecursive(host, cond.whenFalse, result, inLoop, providerCtx, propsParams, scope)
    }
  } else if (node.type === 'if-statement') {
    // An early-return if-statement root (e.g. an asChild split) keeps its
    // subtrees in consequent/alternate — the non-asChild branch's nested icon
    // needs its slot field like any other static child.
    const stmt = node as IRIfStatement
    collectStaticChildInstancesRecursive(host, stmt.consequent, result, inLoop, providerCtx, propsParams, scope)
    if (stmt.alternate) {
      collectStaticChildInstancesRecursive(host, stmt.alternate, result, inLoop, providerCtx, propsParams, scope)
    }
  } else if (node.type === 'provider') {
    collectProviderInstances(host, node as IRProvider, result, inLoop, providerCtx, propsParams, scope)
  } else if (node.type === 'async') {
    collectAsyncInstances(host, node as IRAsync, result, inLoop, providerCtx, propsParams, scope)
  }
}

function collectComponentInstances(
  host: StaticChildrenHost,
  comp: IRComponent,
  result: StaticChildInstance[],
  inLoop: boolean,
  providerCtx: ReadonlyMap<string, string>,
  propsParams: ReadonlyArray<{ name: string }>,
  scope: BindingScope,
): void {
  // Dynamic-tag locals (`const Tag = children.tag`) have no registrable
  // template, so they get no `.<Name>SlotN` struct field. Recurse into
  // their children (which lower as a passthrough) so any real static
  // child components nested inside still get their slot fields.
  if (comp.dynamicTag) {
    for (const child of comp.children) {
      collectStaticChildInstancesRecursive(host, child, result, inLoop, providerCtx, propsParams, scope)
    }
    return
  }
  // Skip Portal (handled via PortalCollector) and loop-internal components
  // (handled by nestedComponents).
  if (comp.name !== 'Portal' && !inLoop && comp.slotId) {
    const suffix = slotIdToFieldSuffix(comp.slotId)
    // Children handed in as a `children={<…/>}` attribute land as a
    // `jsx-children` prop rather than nested between the tags; treat them as
    // the child's effective children when no nested ones exist, so the bake
    // paths below see them.
    const effectiveChildren = comp.children.length > 0
      ? comp.children
      : resolveJsxChildrenProp(comp.props)
    result.push({
      name: comp.name,
      slotId: comp.slotId,
      props: comp.props,
      fieldName: `${comp.name}${suffix}`,
      childrenText: host.extractTextChildren(effectiveChildren),
      childrenHtml: host.extractHtmlChildren(effectiveChildren),
      childrenScopedHtmlExpr: host.extractScopedHtmlChildren(effectiveChildren),
      contextBindings: providerCtx.size > 0 ? providerCtx : undefined,
      rowScope: scope,
    })
    // Action-bearing JSX children render through a companion define with the
    // PARENT's data (see `queueDynamicChildrenDefine`), so component
    // instances nested inside them need their own `<Name>SlotN` fields +
    // constructor inits on THIS component's props. Statically-baked children
    // never contain components (any nested component renders a `{{template}}`
    // action, which the bake extractors reject), so recursing is a no-op.
    for (const child of effectiveChildren) {
      collectStaticChildInstancesRecursive(host, child, result, inLoop, providerCtx, propsParams, scope)
    }
    // A named JSX prop (`header={<span><Badge /></span>}`) whose value can't
    // be baked renders through its own companion define with the PARENT's
    // data too (`queueDynamicPropDefine`), so its nested instances need the
    // same fields. A bakeable value holds no component, so this is a no-op
    // for it.
    for (const prop of comp.props) {
      if (prop.value.kind !== 'jsx-children' || prop.name === 'children') continue
      for (const child of prop.value.children) {
        collectStaticChildInstancesRecursive(host, child, result, inLoop, providerCtx, propsParams, scope)
      }
    }
  }
  // Recurse into Portal's children to find nested components
  if (comp.name === 'Portal' && comp.children) {
    for (const child of comp.children) {
      collectStaticChildInstancesRecursive(host, child, result, inLoop, providerCtx, propsParams, scope)
    }
  }
}

function collectLoopInstances(
  host: StaticChildrenHost,
  loop: IRLoop,
  result: StaticChildInstance[],
  inLoop: boolean,
  providerCtx: ReadonlyMap<string, string>,
  propsParams: ReadonlyArray<{ name: string }>,
  scope: BindingScope,
): void {
  // A loop whose body IS a single component is the nestedComponents /
  // wrapper-slice machinery's case — mark its subtree as in-loop so the
  // component (and its body children, which live on the wrapper struct)
  // are skipped here. A component merely nested inside an element item
  // (`<li><Badge/></li>`, #2130) gets NO wrapper slice: keep collecting,
  // so it registers a normal once-per-slot instance (shared across rows,
  // like the wrapper's `bodyChildInstances`); per-item content reaches it
  // through the loop-body children define (see `renderComponent`).
  const rowScope = scope.enterLoopRow(loop)
  for (const child of loop.children) {
    collectStaticChildInstancesRecursive(
      host,
      child,
      result,
      inLoop || !!loop.childComponent,
      providerCtx,
      propsParams,
      rowScope,
    )
  }
}

function collectProviderInstances(
  host: StaticChildrenHost,
  p: IRProvider,
  result: StaticChildInstance[],
  inLoop: boolean,
  providerCtx: ReadonlyMap<string, string>,
  propsParams: ReadonlyArray<{ name: string }>,
  scope: BindingScope,
): void {
  // SSR context propagation: record the provider's value against its context
  // name and extend the active binding map for descendants. A literal value
  // lowers to a Go literal; an object-literal value lowers to a Go map when
  // every member is a supported shape (#2087 — see `extendProviderContext`);
  // anything else is left unbound (the consumer keeps its default).
  const childCtx = host.extendProviderContext(providerCtx, p, propsParams)
  for (const child of p.children) {
    collectStaticChildInstancesRecursive(host, child, result, inLoop, childCtx, propsParams, scope)
  }
}

function collectAsyncInstances(
  host: StaticChildrenHost,
  a: IRAsync,
  result: StaticChildInstance[],
  inLoop: boolean,
  providerCtx: ReadonlyMap<string, string>,
  propsParams: ReadonlyArray<{ name: string }>,
  scope: BindingScope,
): void {
  // Async fallback + children render server-side via the OOS
  // protocol; static child components inside them still need slot
  // fields on the parent struct.
  collectStaticChildInstancesRecursive(host, a.fallback, result, inLoop, providerCtx, propsParams, scope)
  for (const child of a.children) {
    collectStaticChildInstancesRecursive(host, child, result, inLoop, providerCtx, propsParams, scope)
  }
}
