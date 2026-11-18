/**
 * "Does this part of a loop row read anything beyond the row itself?"
 *
 * A static array's row never changes after first render, so a binding that
 * reads only the row's own item / index has the value SSR already rendered
 * and needs no client wiring. A binding that reaches a signal, a memo or a
 * prop may change later and has to stay live. The static-array loop path
 * asks this of a row conditional — of its condition (#2897, #3912) and of
 * what its branches contain (#3911) — to decide whether the row can be
 * baked once.
 *
 * The reach is followed THROUGH component-local helpers: a `function`
 * declaration or a function-valued constant reads whatever its body reads
 * once it is called (`function isSel(id) { return sel() === id }`), and the
 * call site names only the helper. `needsEffectWrapper` stops at a
 * function-valued constant and never sees a `function` declaration, which is
 * how such a condition used to be baked.
 *
 * Every input is a free-identifier set the analyzer computed from the AST
 * (`origin.freeRefs`, `AttrMeta.freeIdentifiers`, `arrayFreeIdentifiers`,
 * `FunctionInfo.freeIdentifiers`, `ConstantInfo.freeIdentifiers`). No
 * expression text is read.
 *
 * What it cannot see is decided toward the live path where the compiler owns
 * the answer, and left as it was where it does not:
 *
 * - an absent identifier set, a helper with no recorded set, and a `.map()`
 *   preamble local all count as reaching beyond the row;
 * - an import or a global is not followed. A call to one (`isNavGroup(entry)`)
 *   stays row-fixed, as it was before this module existed. Treating every
 *   imported call as live would move rows off the static path for the common
 *   pure predicate, to cover a module-scope signal read in another file.
 */

import type { ConstantInfo, FunctionInfo, IRAttribute, IRConditional, IRElement, IRExpression, IRLoop, IRNode } from '../types.ts'
import { isChildrenPropParam } from '../types.ts'
import type { BindingScope } from '../scope/binding-scope.ts'
import type { ClientJsContext } from './types.ts'
import { buildLoopRowScope } from './reactivity.ts'
import { walkIR } from './walker.ts'

/** The component's names by what a read of them can reach, built once per compile. */
interface ComponentNames {
  /** Signal getters, memos and prop bindings: a read of one is a reactive read. */
  reactive: ReadonlySet<string>
  functions: ReadonlyMap<string, FunctionInfo>
  constants: ReadonlyMap<string, ConstantInfo>
  /** Memo of `nameReachesReactive` for helpers, which every call site re-asks. */
  reach: Map<string, boolean>
}

const namesCache = new WeakMap<ClientJsContext, ComponentNames>()

function componentNamesOf(ctx: ClientJsContext): ComponentNames {
  const cached = namesCache.get(ctx)
  if (cached) return cached
  const reactive = new Set<string>()
  for (const s of ctx.signals) reactive.add(s.getter)
  for (const m of ctx.memos) reactive.add(m.name)
  for (const p of ctx.propsParams) if (!isChildrenPropParam(p)) reactive.add(p.name)
  if (ctx.propsObjectName) reactive.add(ctx.propsObjectName)
  if (ctx.restPropsName) reactive.add(ctx.restPropsName)
  const functions = new Map<string, FunctionInfo>()
  for (const f of ctx.localFunctions) if (!functions.has(f.name)) functions.set(f.name, f)
  const constants = new Map<string, ConstantInfo>()
  for (const c of ctx.localConstants) if (!constants.has(c.name)) constants.set(c.name, c)
  const names: ComponentNames = { reactive, functions, constants, reach: new Map() }
  namesCache.set(ctx, names)
  return names
}

/**
 * Whether reading (or calling) the component-scope name `name` can reach a
 * signal, memo or prop, following local functions and constants through
 * their own free identifiers. `visiting` breaks cycles (`const a = () => b()`
 * / `const b = () => a()`): a name already on the path adds nothing new.
 */
function nameReachesReactive(name: string, names: ComponentNames, visiting: Set<string>): boolean {
  if (names.reactive.has(name)) return true
  const known = names.reach.get(name)
  if (known !== undefined) return known
  if (visiting.has(name)) return false
  const local = names.functions.get(name) ?? names.constants.get(name)
  // Not a component-local: an import, a global, or a helper's own
  // parameter / local (a `function` declaration's recorded set keeps those).
  if (!local) return false
  visiting.add(name)
  // FAIL-SAFE: a local the analyzer recorded no identifier set for.
  const free = local.freeIdentifiers
  const reaches = free === undefined || anyReachesReactive(free, names, visiting)
  visiting.delete(name)
  // A `false` found while another name is still on the path may only mean
  // the cycle was cut there, so it is not a fact about this name alone.
  if (reaches || visiting.size === 0) names.reach.set(name, reaches)
  return reaches
}

function anyReachesReactive(free: ReadonlySet<string>, names: ComponentNames, visiting: Set<string>): boolean {
  for (const name of free) {
    if (nameReachesReactive(name, names, visiting)) return true
  }
  return false
}

/**
 * Whether an expression with the free identifiers `free`, evaluated in the
 * loop row `scope`, reads beyond that row: a signal, memo or prop, directly
 * or through a component-local helper.
 *
 * A name the row binds is the row's own value and hides a component-scope
 * name it shadows. A `.map()` preamble local is bound by the row too, but
 * its value is whatever the preamble read, which is not resolved here, so it
 * counts as reaching beyond the row.
 *
 * FAIL-SAFE: an absent set is "unknown", not "reads nothing", and answers
 * `true`.
 */
export function readsBeyondLoopScope(
  free: ReadonlySet<string> | null | undefined,
  scope: BindingScope | undefined,
  ctx: ClientJsContext,
): boolean {
  if (!free) return true
  const names = componentNamesOf(ctx)
  const rowValues = scope?.valueBoundNames()
  for (const name of free) {
    if (rowValues?.has(name)) continue
    if (scope?.isBound(name)) return true
    if (nameReachesReactive(name, names, new Set())) return true
  }
  return false
}

/** Free identifiers of a node's source expression, or `null` when Phase 1 resolved none. */
function originFreeIds(node: IRExpression | IRConditional): ReadonlySet<string> | null {
  const refs = node.origin?.freeRefs
  if (!refs) return null
  const names = new Set<string>()
  for (const ref of refs) names.add(ref.name)
  return names
}

/** Attribute value kinds that carry an expression (the rest are baked into the markup). */
function isDynamicAttr(attr: IRAttribute): boolean {
  return attr.value.kind === 'expression' || attr.value.kind === 'template' || attr.value.kind === 'spread'
}

/**
 * Whether a loop nested in the subtree can be left baked: a static array
 * whose source is row-fixed and whose callback has nothing this walk cannot
 * see into (a `.filter()` / `.sort()` chain, a preamble, a `flatMap`
 * callback body). Its row content is checked by the caller's descent.
 */
function nestedLoopSourceIsFixed(loop: IRLoop, scope: BindingScope | undefined, ctx: ClientJsContext): boolean {
  if (!loop.isStaticArray || loop.clientOnly) return false
  if (loop.filterPredicate || loop.sortComparator || loop.preamble || loop.flatMapCallback) return false
  return !readsBeyondLoopScope(loop.arrayFreeIdentifiers, scope, ctx)
}

/**
 * Whether a branch of a row conditional (`root`) holds anything the client
 * has to wire for a row that never changes:
 *
 * - a value that reads beyond the loop row `scope` — a text slot, an
 *   attribute of a slotted element, the condition of a slotted conditional,
 *   or the source of a nested loop;
 * - an event handler or a `ref`, which the row conditional's own branch
 *   binding attaches and nothing else does.
 *
 * A text or attribute without a slot is skipped, since no path could update
 * it. Child-component props are not looked at: the static-array path hands
 * them to `initChild` as live getters itself.
 */
export function branchNeedsLiveRow(
  root: IRNode,
  scope: BindingScope | undefined,
  ctx: ClientJsContext,
): boolean {
  let found = false
  walkIR<BindingScope | undefined>(root, scope, {
    expression: ({ node, scope: s }) => {
      if (found || !node.slotId) return
      if (node.reactive || readsBeyondLoopScope(originFreeIds(node), s, ctx)) found = true
    },
    element: ({ node, scope: s, descend }) => {
      if (found) return
      if (node.events.length > 0 || node.ref || elementAttrsReadBeyond(node, s, ctx)) {
        found = true
        return
      }
      descend()
    },
    conditional: ({ node, scope: s, descend }) => {
      if (found) return
      if (node.slotId && (node.reactive || readsBeyondLoopScope(originFreeIds(node), s, ctx))) {
        found = true
        return
      }
      descend()
    },
    loop: ({ node, scope: s, descend }) => {
      if (found) return
      if (!nestedLoopSourceIsFixed(node, s, ctx)) {
        found = true
        return
      }
      descend(buildLoopRowScope(node.param, node.paramBindings, undefined, node.index, s))
    },
  })
  return found
}

function elementAttrsReadBeyond(el: IRElement, scope: BindingScope | undefined, ctx: ClientJsContext): boolean {
  if (!el.slotId) return false
  return el.attrs.some(a => isDynamicAttr(a) && readsBeyondLoopScope(a.freeIdentifiers, scope, ctx))
}
