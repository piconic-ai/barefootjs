/**
 * `checkAsyncActionReads` (#3165, BF117): a read of a query action in a
 * template-lowered position is refused at compile time, uniformly across every
 * adapter including Hono.
 *
 * `const [posts, fetchPosts] = createQuery(fn, options)` seeds `posts()` from
 * `options.initial`. Since #3166, `fetchPosts.isPending()` / `fetchPosts.error()`
 * are ALSO seeded (`false` / `undefined`, spec/async.md §7.3) when read as the
 * WHOLE template-position expression — see `action-accessor.ts`, the one place
 * that recognises the shape and the seed both this pass and `jsx-to-ir.ts`
 * share. Everything else here is unchanged: calling the action itself
 * (`fetchPosts()`) still sends a request during render, and a compound or
 * nested accessor read (`!fetchPosts.isPending()`, buried inside a memo) has
 * no seed substitution yet, so a template position may still not:
 *
 * - call the action (`fetchPosts()`),
 * - read a memo or a component-local constant that reads the action, since
 *   every backend evaluates a memo or constant it renders, or
 * - call a local function that reads the action.
 *
 * "Reads the action" is transitive through memos, constants and functions
 * (a constant reading a memo reading the action counts). Passing the action,
 * or a local function that reads it, as a value (`<Retry onRetry={fetchPosts} />`,
 * `run={reload}`) is fine: nothing runs until the client calls it. A constant
 * that only aliases one of them (`const run = fetchPosts`) is treated like its
 * target. Any read inside an event handler or effect is fine too, since those
 * only run on the client. A `/* @client *\/`-marked position is skipped by
 * `walkTemplatePositions`: the read is deferred to the client.
 *
 * Other function-valued expressions that read the action are refused even when
 * they are only passed on, because the walk cannot tell passing from calling
 * during render (an array-method callback runs then): an inline arrow outside
 * an `on*` prop (`run={() => fetchPosts()}`), and a constant holding arrows in an object or
 * array literal (`const h = { run: () => fetchPosts() }`, `run={h.run}`). Name
 * the function as a local instead, or mark the position `/* @client *\/`.
 */

import type { IRNode, IRMetadata, CompilerError, SourceLocation } from './types.ts'
import type { ParsedExpr } from './expression-parser.ts'
import { ErrorCodes } from './errors.ts'
import { isEventHandlerName } from './event-handler-name.ts'
import { walkTemplatePositions } from './template-position-walk.ts'
import { matchActionAccessorCall, collectActionNames } from './action-accessor.ts'

/**
 * Properties of a query action that are reactive accessors. Mirrors the
 * `Reactive` members of `QueryAction` in `packages/client/src/create-query.ts`:
 * an accessor added there must be added here.
 */
const ACTION_ACCESSORS: ReadonlySet<string> = new Set(['isPending', 'error'])

/** What a template position read, for the diagnostic. */
type ActionRead =
  | { kind: 'accessor'; action: string; accessor: string }
  | { kind: 'call'; action: string }
  | { kind: 'local'; name: string; declaration: 'memo' | 'constant' | 'function'; action: string }

/** A component-local declaration that reads a query action, and the action it reaches. */
interface ActionReader {
  declaration: 'memo' | 'constant' | 'function'
  action: string
}

/**
 * The component-local declarations that read a query action, split by how a
 * template position evaluates them: `values` (memos and constants whose value
 * is computed when rendered, so a reference is a read) and `callables`
 * (functions, and constants whose value is a function, whose body runs only
 * when called).
 */
interface ActionReaders {
  values: ReadonlyMap<string, ActionReader>
  callables: ReadonlyMap<string, ActionReader>
}

export function checkAsyncActionReads(root: IRNode, metadata: IRMetadata, errors: CompilerError[]): void {
  // The action bindings a recognised factory produced DIRECTLY — the same
  // set `jsx-to-ir.ts`'s seed substitution recognises (`action-accessor.ts`).
  // Kept separate from `actions` below (which also grows through aliases):
  // the seed substitution only ever rewrites a read of a DIRECT binding, so
  // the "no longer refused" check here must match exactly that, not a wider
  // alias-grown set — an aliased read (`const run = fetchPosts;
  // run.isPending()`) stays refused below exactly as before #3166, since
  // nothing seeds it structurally.
  const directActions = collectActionNames(metadata.signals)
  if (directActions.size === 0) return
  const actions = new Set(directActions)
  // `const run = fetchPosts` is the action under another name.
  for (let grew = true; grew; ) {
    grew = false
    for (const constant of metadata.localConstants) {
      const target = aliasTarget(constant)
      if (target !== undefined && actions.has(target) && !actions.has(constant.name)) {
        actions.add(constant.name)
        grew = true
      }
    }
  }
  const readers = localsReadingActions(metadata, actions)
  const seen = new Set<string>()
  walkTemplatePositions(root, ({ expr, loc, attrName }) => {
    if (attrName !== undefined && isEventHandlerName(attrName)) return
    // #3166: a direct accessor read AS THE WHOLE template-position expression
    // is an ordinary seeded value now (`action-accessor.ts`) — no refusal.
    // `jsx-to-ir.ts` substitutes this exact same shape with its seed, so the
    // two stay in sync by construction. A compound/nested use is NOT matched
    // here (`matchActionAccessorCall` only matches the whole expression) and
    // falls through to `findActionRead` below, refused exactly as before.
    if (matchActionAccessorCall(expr, directActions)) return
    const read = findActionRead(expr, actions, readers, new Set())
    if (read) pushDiagnostic(errors, seen, loc, read)
  })
}

/**
 * The component-local memos, constants and functions that read a query
 * action, directly or through another such declaration (a fixpoint). Uses each
 * declaration's free identifiers, so a block-bodied memo or function is
 * covered too: mentioning the action, or a declaration that reads it, is
 * enough, since the only things a body can do with the action are read an
 * accessor, send a request, or pass it on. JSX-valued constants and functions
 * are skipped: they are inlined into the IR, where the walk sees their reads
 * directly. `isModule` is not consulted: for a function it only marks a
 * candidate for hoisting (`compute-scope.ts` decides), and a declaration that
 * really lives at module scope cannot name a component's action anyway.
 */
function localsReadingActions(metadata: IRMetadata, actions: ReadonlySet<string>): ActionReaders {
  const values = new Map<string, ActionReader>()
  const callables = new Map<string, ActionReader>()
  const candidates: Array<{
    name: string
    declaration: ActionReader['declaration']
    callable: boolean
    freeIds: Iterable<string>
    aliasOf?: string
  }> = []
  for (const memo of metadata.memos) {
    candidates.push({ name: memo.name, declaration: 'memo', callable: false, freeIds: memo.computationFreeIdentifiers ?? [] })
  }
  for (const constant of metadata.localConstants) {
    if (constant.isJsx || constant.isJsxFunction || actions.has(constant.name)) continue
    candidates.push({
      name: constant.name,
      declaration: 'constant',
      callable: constant.isFunctionValue === true,
      freeIds: constant.freeIdentifiers ?? [],
      aliasOf: aliasTarget(constant),
    })
  }
  for (const fn of metadata.localFunctions) {
    if (fn.isJsxFunction) continue
    candidates.push({ name: fn.name, declaration: 'function', callable: true, freeIds: fn.freeIdentifiers ?? [] })
  }

  let changed = true
  while (changed) {
    changed = false
    for (const candidate of candidates) {
      if (values.has(candidate.name) || callables.has(candidate.name)) continue
      if (candidate.aliasOf !== undefined) {
        // An alias reads the action only if its target does, and is called or
        // referenced the same way.
        const target = values.get(candidate.aliasOf) ?? callables.get(candidate.aliasOf)
        if (target === undefined) continue
        const reader = { declaration: candidate.declaration, action: target.action }
        if (callables.has(candidate.aliasOf)) callables.set(candidate.name, reader)
        else values.set(candidate.name, reader)
        changed = true
        continue
      }
      for (const id of candidate.freeIds) {
        if (id === candidate.name) continue
        const action = actions.has(id) ? id : (values.get(id) ?? callables.get(id))?.action
        if (action === undefined) continue
        const reader = { declaration: candidate.declaration, action }
        if (candidate.callable) callables.set(candidate.name, reader)
        else values.set(candidate.name, reader)
        changed = true
        break
      }
    }
  }
  return { values, callables }
}

/** The name a constant only aliases (`const run = fetchPosts`), if it is one. */
function aliasTarget(constant: IRMetadata['localConstants'][number]): string | undefined {
  return constant.parsed?.kind === 'identifier' ? constant.parsed.name : undefined
}

function findActionRead(
  expr: ParsedExpr,
  actions: ReadonlySet<string>,
  readers: ActionReaders,
  bound: ReadonlySet<string>,
): ActionRead | null {
  const recurse = (e: ParsedExpr) => findActionRead(e, actions, readers, bound)
  const first = (...exprs: ParsedExpr[]): ActionRead | null => {
    for (const e of exprs) {
      const read = recurse(e)
      if (read) return read
    }
    return null
  }
  switch (expr.kind) {
    case 'identifier': {
      if (bound.has(expr.name)) return null
      const reader = readers.values.get(expr.name)
      return reader ? { kind: 'local', name: expr.name, ...reader } : null
    }
    case 'member':
      if (
        expr.object.kind === 'identifier' &&
        actions.has(expr.object.name) &&
        !bound.has(expr.object.name) &&
        ACTION_ACCESSORS.has(expr.property)
      ) {
        return { kind: 'accessor', action: expr.object.name, accessor: expr.property }
      }
      return recurse(expr.object)
    case 'call':
      if (expr.callee.kind === 'identifier' && !bound.has(expr.callee.name)) {
        if (actions.has(expr.callee.name)) return { kind: 'call', action: expr.callee.name }
        const reader = readers.callables.get(expr.callee.name)
        if (reader) return { kind: 'local', name: expr.callee.name, ...reader }
      }
      return first(expr.callee, ...expr.args)
    case 'index-access':
      return first(expr.object, expr.index)
    case 'binary':
    case 'logical':
      return first(expr.left, expr.right)
    case 'unary':
      return recurse(expr.argument)
    case 'conditional':
      return first(expr.test, expr.consequent, expr.alternate)
    case 'template-literal':
      return first(...expr.parts.flatMap((p) => (p.type === 'expression' ? [p.expr] : [])))
    case 'array-literal':
      return first(...expr.elements)
    case 'object-literal':
      return first(...expr.properties.map((p) => (p.kind === 'spread' ? p.expr : p.value)))
    case 'array-method':
      return first(expr.object, ...expr.args, ...(expr.method === 'flat' && expr.depthExpr ? [expr.depthExpr] : []))
    case 'arrow': {
      const inner = new Set(bound)
      for (const p of expr.params) inner.add(p)
      return findActionRead(expr.body, actions, readers, inner)
    }
    case 'literal':
    case 'regex':
    case 'unsupported':
      return null
  }
}

function pushDiagnostic(errors: CompilerError[], seen: Set<string>, loc: SourceLocation, read: ActionRead): void {
  const key = `${loc.start.line}:${loc.start.column}`
  if (seen.has(key)) return
  seen.add(key)
  const what =
    read.kind === 'accessor'
      ? `'${read.action}.${read.accessor}' reads a query action's accessor`
      : read.kind === 'call'
        ? `'${read.action}()' calls a query action, which sends a request,`
        : `${read.declaration} '${read.name}' reads the query action '${read.action}' and is used`
  errors.push({
    code: ErrorCodes.ASYNC_ACTION_READ_IN_TEMPLATE,
    severity: 'error',
    message:
      `${what} in a template position. The request function never runs on the server, so ` +
      `'${read.action}.isPending()' and '${read.action}.error()' have no value to render there yet.`,
    loc,
    suggestion: {
      message:
        'Defer the read to the client with /* @client */, or read it inside an event handler or ' +
        'effect, which only run on the client.',
      escape: [{ kind: 'client-directive' }],
    },
  })
}
