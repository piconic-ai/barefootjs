/**
 * `checkAsyncActionReads` (#3165, BF117): a read of a query action in a
 * template-lowered position is refused at compile time, uniformly across every
 * adapter including Hono.
 *
 * `const [posts, fetchPosts] = createQuery(fn, options)` seeds `posts()` from
 * `options.initial`, but nothing seeds `fetchPosts.isPending()` or
 * `fetchPosts.error()`: the request function never runs on the server, and no
 * backend has a value for them yet. Calling the action itself would send a
 * request during render. So a template position may not:
 *
 * - read an accessor (`fetchPosts.isPending()`, `fetchPosts.error`),
 * - call the action (`fetchPosts()`), or
 * - read a memo that reads the action (transitively), since every backend
 *   evaluates a memo it renders.
 *
 * Passing the action itself as a value (`<Retry onRetry={fetchPosts} />`) is
 * fine, and so is any read inside an event handler or effect, which only run
 * on the client. A `/* @client *\/`-marked position is skipped by
 * `walkTemplatePositions`: the read is deferred to the client.
 */

import type { IRNode, IRMetadata, CompilerError, SourceLocation } from './types.ts'
import type { ParsedExpr } from './expression-parser.ts'
import { ErrorCodes } from './errors.ts'
import { isEventHandlerName } from './event-handler-name.ts'
import { walkTemplatePositions } from './template-position-walk.ts'

/** Properties of a query action that are reactive accessors (`QueryAction` in `@barefootjs/client`). */
const ACTION_ACCESSORS: ReadonlySet<string> = new Set(['isPending', 'error'])

/** What a template position read, for the diagnostic. */
type ActionRead =
  | { kind: 'accessor'; action: string; accessor: string }
  | { kind: 'call'; action: string }
  | { kind: 'memo'; memo: string; action: string }

export function checkAsyncActionReads(root: IRNode, metadata: IRMetadata, errors: CompilerError[]): void {
  const actions = new Set<string>()
  for (const signal of metadata.signals) {
    if (signal.factory?.action) actions.add(signal.factory.action)
  }
  if (actions.size === 0) return
  const memoActions = memosReadingActions(metadata, actions)
  const seen = new Set<string>()
  walkTemplatePositions(root, ({ expr, loc, attrName }) => {
    if (attrName !== undefined && isEventHandlerName(attrName)) return
    const read = findActionRead(expr, actions, memoActions, new Set())
    if (read) pushDiagnostic(errors, seen, loc, read)
  })
}

/**
 * Memos whose computation reads a query action, directly or through another
 * such memo, mapped to the action they reach. Uses each memo's free
 * identifiers (so a block-bodied memo is covered too): mentioning the action
 * at all is enough, since the only things a memo can do with it are read an
 * accessor or send a request.
 */
function memosReadingActions(metadata: IRMetadata, actions: ReadonlySet<string>): Map<string, string> {
  const reading = new Map<string, string>()
  let changed = true
  while (changed) {
    changed = false
    for (const memo of metadata.memos) {
      if (reading.has(memo.name)) continue
      for (const id of memo.computationFreeIdentifiers ?? []) {
        const action = actions.has(id) ? id : reading.get(id)
        if (action !== undefined) {
          reading.set(memo.name, action)
          changed = true
          break
        }
      }
    }
  }
  return reading
}

function findActionRead(
  expr: ParsedExpr,
  actions: ReadonlySet<string>,
  memoActions: ReadonlyMap<string, string>,
  bound: ReadonlySet<string>,
): ActionRead | null {
  const recurse = (e: ParsedExpr) => findActionRead(e, actions, memoActions, bound)
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
      const action = memoActions.get(expr.name)
      return action !== undefined ? { kind: 'memo', memo: expr.name, action } : null
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
      if (expr.callee.kind === 'identifier' && actions.has(expr.callee.name) && !bound.has(expr.callee.name)) {
        return { kind: 'call', action: expr.callee.name }
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
      return findActionRead(expr.body, actions, memoActions, inner)
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
        : `'${read.memo}' reads the query action '${read.action}'`
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
