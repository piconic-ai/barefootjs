/**
 * Build a `ReferencesGraph` (see `packages/jsx/src/types.ts`) for a
 * component from its `ClientJsContext` plus the IR root.
 *
 * Replaces the three ad-hoc extraction passes
 * (`collectUsedIdentifiers` / `collectUsedFunctions` /
 * `collectIdentifiersFromIRTree`) that `generate-init.ts` used to run
 * inline. Callers derive the facts they need via pure queries on the
 * returned graph:
 *
 *   usedIdentifiers           = edges not tagged 'assignment-target',
 *                               unioned over `.to`
 *   usedFunctions             = edges tagged 'event-handler',
 *                               unioned over `.to`
 *   initStmtAssignedIdents    = edges tagged 'assignment-target',
 *                               unioned over `.to`
 *   functionReferences(name)  = edges whose `from.kind === 'function'`
 *                               and `from.name === name`
 *
 * Byte-identical invariant: edges are emitted in the exact same order
 * that the pre-#1021 composition of `collectUsedIdentifiers` +
 * `collectUsedFunctions` + `collectIdentifiersFromIRTree` + the init
 * statement merge produced, so that the `Set` derived from `.to` has
 * the same insertion order — which `emitPropsExtraction` relies on for
 * deterministic prop destructure line ordering.
 *
 * Stage B of issue #1021 — analysis-on-IR refactor. See
 * `spec/compiler-analysis-ir.md` for the target shape.
 */

import type {
  IRLoopChildComponent,
  IRNode,
  ReferenceContext,
  ReferenceEdge,
  ReferenceSource,
  ReferencesGraph,
} from '../types'
import type { IRVisitor as WalkerVisitor } from './walker'
import { attrValueToString } from './utils'
import type { ClientJsContext } from './types'
import { extractIdentifiers, extractTemplateIdentifiers } from './identifiers'
import { walkIR } from './walker'

const COMPONENT_ROOT: ReferenceSource = { kind: 'component-root', name: null }
const INIT_STATEMENT_SOURCE: ReferenceSource = { kind: 'init-statement', name: null }
const BARE_IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export function buildReferencesGraph(ctx: ClientJsContext, irRoot: IRNode): ReferencesGraph {
  const edges: ReferenceEdge[] = []
  const declaredNames = new Set<string>()
  const propNames = new Set<string>()

  for (const c of ctx.localConstants) declaredNames.add(c.name)
  for (const f of ctx.localFunctions) declaredNames.add(f.name)
  for (const s of ctx.signals) {
    declaredNames.add(s.getter)
    if (s.setter) declaredNames.add(s.setter)
  }
  for (const m of ctx.memos) declaredNames.add(m.name)
  for (const p of ctx.propsParams) {
    declaredNames.add(p.name)
    propNames.add(p.name)
  }
  if (ctx.propsObjectName) {
    declaredNames.add(ctx.propsObjectName)
    propNames.add(ctx.propsObjectName)
  }

  const addExprEdges = (
    from: ReferenceSource | null,
    expr: string,
    context: ReferenceContext,
  ): void => {
    const names = new Set<string>()
    extractIdentifiers(expr, names)
    for (const name of names) edges.push({ from, to: name, context })
  }

  const addTemplateEdges = (
    from: ReferenceSource | null,
    template: string,
    context: ReferenceContext,
  ): void => {
    const names = new Set<string>()
    extractTemplateIdentifiers(template, names)
    for (const name of names) edges.push({ from, to: name, context })
  }

  // ============================================================================
  // Phase 1 — mirror `collectUsedIdentifiers` in identifiers.ts verbatim order.
  // Each block is annotated with the equivalent lines in the old function so
  // future drift between the two is easy to catch during review.
  // ============================================================================

  // identifiers.ts L79-83
  for (const elem of ctx.interactiveElements) {
    for (const event of elem.events) {
      addExprEdges(COMPONENT_ROOT, event.handler, 'init-body')
    }
  }

  // identifiers.ts L85-87
  for (const elem of ctx.dynamicElements) {
    addExprEdges(COMPONENT_ROOT, elem.expression, 'template-closure')
  }

  // identifiers.ts L89-93
  for (const elem of ctx.conditionalElements) {
    addExprEdges(COMPONENT_ROOT, elem.condition, 'template-closure')
    addTemplateEdges(COMPONENT_ROOT, elem.whenTrueHtml, 'template-closure')
    addTemplateEdges(COMPONENT_ROOT, elem.whenFalseHtml, 'template-closure')
  }

  // identifiers.ts L95-105
  for (const elem of ctx.clientOnlyConditionals) {
    addExprEdges(COMPONENT_ROOT, elem.condition, 'template-closure')
    addTemplateEdges(COMPONENT_ROOT, elem.whenTrueHtml, 'template-closure')
    addTemplateEdges(COMPONENT_ROOT, elem.whenFalseHtml, 'template-closure')
    for (const event of elem.whenTrue.events) {
      addExprEdges(COMPONENT_ROOT, event.handler, 'init-body')
    }
    for (const event of elem.whenFalse.events) {
      addExprEdges(COMPONENT_ROOT, event.handler, 'init-body')
    }
  }

  // identifiers.ts L107-135
  for (const elem of ctx.loopElements) {
    addExprEdges(COMPONENT_ROOT, elem.array, 'template-closure')
    addTemplateEdges(COMPONENT_ROOT, elem.template, 'template-closure')
    for (const handler of elem.childEventHandlers) {
      addExprEdges(COMPONENT_ROOT, handler, 'init-body')
    }
    if (elem.childComponent) {
      for (const prop of elem.childComponent.props) {
        addExprEdges(COMPONENT_ROOT, prop.value, 'template-closure')
      }
    }
    if (elem.nestedComponents) {
      for (const comp of elem.nestedComponents) {
        for (const prop of comp.props) {
          addExprEdges(COMPONENT_ROOT, prop.value, 'template-closure')
        }
      }
    }
    if (elem.filterPredicate) addExprEdges(COMPONENT_ROOT, elem.filterPredicate.raw, 'template-closure')
    if (elem.sortComparator) addExprEdges(COMPONENT_ROOT, elem.sortComparator.raw, 'template-closure')
    if (elem.mapPreamble) addExprEdges(COMPONENT_ROOT, elem.mapPreamble, 'template-closure')
    for (const attr of elem.childReactiveAttrs) {
      addExprEdges(COMPONENT_ROOT, attr.expression, 'template-closure')
    }
  }

  // identifiers.ts L137-139
  for (const signal of ctx.signals) {
    addExprEdges({ kind: 'signal', name: signal.getter }, signal.initialValue, 'init-body')
  }

  // identifiers.ts L141-143
  for (const memo of ctx.memos) {
    addExprEdges({ kind: 'memo', name: memo.name }, memo.computation, 'init-body')
  }

  // identifiers.ts L145-147
  for (const effect of ctx.effects) {
    addExprEdges({ kind: 'effect', name: null }, effect.body, 'init-body')
  }

  // identifiers.ts L149-151
  for (const onMount of ctx.onMounts) {
    addExprEdges({ kind: 'on-mount', name: null }, onMount.body, 'init-body')
  }

  // identifiers.ts L153-155
  for (const elem of ctx.refElements) {
    addExprEdges(COMPONENT_ROOT, elem.callback, 'init-body')
  }

  // identifiers.ts L157-164 — conditional ref callbacks (top-level)
  for (const elem of ctx.conditionalElements) {
    for (const ref of elem.whenTrue.refs) {
      addExprEdges(COMPONENT_ROOT, ref.callback, 'init-body')
    }
    for (const ref of elem.whenFalse.refs) {
      addExprEdges(COMPONENT_ROOT, ref.callback, 'init-body')
    }
  }

  // identifiers.ts L166-173 — client-only conditional ref callbacks
  for (const elem of ctx.clientOnlyConditionals) {
    for (const ref of elem.whenTrue.refs) {
      addExprEdges(COMPONENT_ROOT, ref.callback, 'init-body')
    }
    for (const ref of elem.whenFalse.refs) {
      addExprEdges(COMPONENT_ROOT, ref.callback, 'init-body')
    }
  }

  // identifiers.ts L175-177
  for (const fn of ctx.localFunctions) {
    addExprEdges({ kind: 'function', name: fn.name }, fn.body, 'init-body')
  }

  // identifiers.ts L179-181
  for (const constant of ctx.localConstants) {
    if (constant.value) {
      addExprEdges({ kind: 'constant', name: constant.name }, constant.value, 'init-body')
    }
  }

  // identifiers.ts L183-185
  for (const child of ctx.childInits) {
    addExprEdges(COMPONENT_ROOT, child.propsExpr, 'template-closure')
  }

  // identifiers.ts L187-189
  for (const attr of ctx.reactiveAttrs) {
    addExprEdges(COMPONENT_ROOT, attr.expression, 'template-closure')
  }

  // identifiers.ts L191-194
  for (const provider of ctx.providerSetups) {
    addExprEdges(COMPONENT_ROOT, provider.contextName, 'init-body')
    addExprEdges(COMPONENT_ROOT, provider.valueExpr, 'init-body')
  }

  // ============================================================================
  // Phase 2 — bare event-handler names. Mirrors `collectUsedFunctions`.
  // Emitted as additional `event-handler` edges AFTER the init-body edges
  // above so that `graphUsedFunctions` is the tighter query surface for
  // `emitPropsEventHandlers`. These names are already covered in phase 1
  // via `extractIdentifiers`, so the relative order of `to`-values in
  // `graphUsedIdentifiers` is unchanged.
  // ============================================================================

  for (const elem of ctx.interactiveElements) {
    for (const event of elem.events) {
      if (BARE_IDENT_RE.test(event.handler)) {
        edges.push({ from: COMPONENT_ROOT, to: event.handler, context: 'event-handler' })
      }
    }
  }

  // ============================================================================
  // Phase 3 — IR tree walk, mirrors `collectIdentifiersFromIRTree`. Catches
  // identifiers in ANY context (nested component props, loop children,
  // conditional branches, provider value props, …). Stage B keeps the walk
  // as a safety net so new JSX patterns do not silently break; Stage C+
  // folds these contexts into first-class edge emitters as the IR node
  // shapes tighten.
  // ============================================================================

  const visitor: WalkerVisitor<null> = {
    element: ({ node: el, descend }) => {
      for (const attr of el.attrs) {
        if (attr.dynamic && attr.value) {
          const v = typeof attr.value === 'string' ? attr.value : attrValueToString(attr.value)
          if (v) addExprEdges(COMPONENT_ROOT, v, 'template-closure')
        }
      }
      for (const ev of el.events) addExprEdges(COMPONENT_ROOT, ev.handler, 'init-body')
      descend()
    },
    component: ({ node: c, descend, descendJsxChildren }) => {
      for (const prop of c.props) {
        if (prop.dynamic) addExprEdges(COMPONENT_ROOT, prop.value, 'template-closure')
      }
      descend()
      descendJsxChildren()
    },
    expression: ({ node: ex }) => {
      addExprEdges(COMPONENT_ROOT, ex.expr, 'template-closure')
    },
    conditional: ({ node: c, descend }) => {
      addExprEdges(COMPONENT_ROOT, c.condition, 'template-closure')
      descend()
    },
    ifStatement: ({ node: i, descend }) => {
      addExprEdges(COMPONENT_ROOT, i.condition, 'template-closure')
      for (const sv of i.scopeVariables) {
        addExprEdges(COMPONENT_ROOT, sv.initializer, 'init-body')
      }
      descend()
    },
    loop: ({ node: l, descend }) => {
      addExprEdges(COMPONENT_ROOT, l.array, 'template-closure')
      if (l.filterPredicate) addExprEdges(COMPONENT_ROOT, l.filterPredicate.raw, 'template-closure')
      if (l.sortComparator) addExprEdges(COMPONENT_ROOT, l.sortComparator.raw, 'template-closure')
      if (l.mapPreamble) addExprEdges(COMPONENT_ROOT, l.mapPreamble, 'template-closure')
      descend()
      if (l.childComponent) walkChildComponent(l.childComponent)
      if (l.nestedComponents) {
        for (const comp of l.nestedComponents) walkChildComponent(comp)
      }
    },
    provider: ({ node: p, descend }) => {
      addExprEdges(COMPONENT_ROOT, p.contextName, 'init-body')
      if (p.valueProp.dynamic) addExprEdges(COMPONENT_ROOT, p.valueProp.value, 'template-closure')
      descend()
    },
  }

  const walkChildComponent = (comp: IRLoopChildComponent): void => {
    for (const prop of comp.props) {
      addExprEdges(COMPONENT_ROOT, prop.value, 'template-closure')
    }
    for (const child of comp.children) walkIR(child, null, visitor)
  }

  walkIR(irRoot, null, visitor)

  // ============================================================================
  // Phase 4 — init statements (#930, #933). Mirrors generate-init.ts L95-107.
  // Free identifiers flow into `usedIdentifiers` via the `init-statement`
  // context; assignment targets flow into `initStmtAssignedIdentifiers`
  // via the `assignment-target` context.
  // ============================================================================

  for (const stmt of ctx.initStatements) {
    if (stmt.freeIdentifiers) {
      for (const id of stmt.freeIdentifiers) {
        edges.push({ from: INIT_STATEMENT_SOURCE, to: id, context: 'init-statement' })
      }
    }
    if (stmt.assignedIdentifiers) {
      for (const id of stmt.assignedIdentifiers) {
        edges.push({ from: INIT_STATEMENT_SOURCE, to: id, context: 'assignment-target' })
      }
    }
  }

  return { edges, declaredNames, propNames }
}

// =============================================================================
// Graph queries (pure; no state)
// =============================================================================

/** Name-level reachability: every identifier referenced in any emitted
 *  context except assignment-target. Byte-identical to the pre-#1021
 *  `usedIdentifiers` union built in `generate-init.ts`. */
export function graphUsedIdentifiers(graph: ReferencesGraph): Set<string> {
  const used = new Set<string>()
  for (const edge of graph.edges) {
    if (edge.context === 'assignment-target') continue
    used.add(edge.to)
  }
  return used
}

/** Bare function names used as event handlers (the tighter subset that
 *  `emitPropsEventHandlers` consumes). */
export function graphUsedFunctions(graph: ReferencesGraph): Set<string> {
  const used = new Set<string>()
  for (const edge of graph.edges) {
    if (edge.context === 'event-handler') used.add(edge.to)
  }
  return used
}

/** Identifiers assigned to inside init statements (#933). These route
 *  to module scope in `generate-init.ts`. */
export function graphAssignedIdentifiers(graph: ReferencesGraph): Set<string> {
  const used = new Set<string>()
  for (const edge of graph.edges) {
    if (edge.context === 'assignment-target') used.add(edge.to)
  }
  return used
}

/** All names referenced from a specific function body. Replaces the
 *  per-iteration `extractIdentifiers(fn.body, refs)` inside the
 *  function fixpoint (generate-init.ts L255-278). */
export function graphFunctionReferences(graph: ReferencesGraph, fnName: string): Set<string> {
  const refs = new Set<string>()
  for (const edge of graph.edges) {
    if (edge.from?.kind === 'function' && edge.from.name === fnName) {
      refs.add(edge.to)
    }
  }
  return refs
}
