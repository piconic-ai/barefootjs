/**
 * The one place an inherited literal-const read (`R.toString`, see
 * `spellStaticConstMember`) can reach a server render without an emitter
 * spelling it: the body of a memo the template renders.
 *
 * A template renders a memo by name (`{m()}`), and the adapters compute its
 * server value apart from the position: an in-template seed of every
 * derivable memo (whose lowering failures fall back silently, on purpose, to
 * the static ssr-defaults seed) or a backend-side computation. So the
 * emitter that would refuse the inherited read either never sees the body or
 * has its refusal discarded, and the memo renders empty. This pass refuses
 * the read in the body of each memo a server-rendered position reads,
 * directly or through another memo or a constant (a constant is inlined
 * where it is read): the names come from `walkTemplatePositions`, which skips
 * `/* @client *\/`, and each is resolved in the position's own scope, so a
 * loop row or callback param of the same name is not the memo. A memo read
 * only from client positions, and a module-scope memo, never refuse. Every
 * other read is refused where it is spelled.
 */

import { parsedExprChildren } from '../action-accessor.ts'
import type { ParsedExpr } from '../expression-parser.ts'
import { BindingScope } from '../scope/binding-scope.ts'
import { spellStaticConstMember, staticIndexKey, type StaticConstMemberSink } from '../static-const-member.ts'
import { walkTemplatePositions } from '../template-position-walk.ts'
import type { ComponentIR, MemoInfo } from '../types.ts'

/** Record BF101 for an inherited literal-const read in the body of a memo the server render evaluates. */
export function refuseInheritedReadsInRenderedMemos(ir: ComponentIR, sink: StaticConstMemberSink): void {
  const memos = (ir.metadata.memos ?? []).filter(m => !m.isModule && m.parsed)
  if (memos.length === 0) return
  const component = BindingScope.forComponent(ir.metadata.propsObjectName ?? null)
  const read = new Set<string>()
  walkTemplatePositions(ir.root, ({ expr, scope }) => collectFreeNames(expr, scope ?? component, read), component)
  const constants = ir.metadata.localConstants ?? []
  for (const memo of renderedMemos(memos, constants, read)) {
    spellReads(memo.parsed!, component, constants, sink)
  }
}

/** The memos named in `read`, followed through the memos and constants they name. */
function renderedMemos(memos: MemoInfo[], constants: ComponentIR['metadata']['localConstants'], read: ReadonlySet<string>): MemoInfo[] {
  const byName = new Map(memos.map(m => [m.name, m]))
  const constantByName = new Map(constants.map(c => [c.name, c]))
  const reached: MemoInfo[] = []
  const visited = new Set<string>()
  const pending = [...read]
  while (pending.length > 0) {
    const name = pending.pop()!
    if (visited.has(name)) continue
    visited.add(name)
    const memo = byName.get(name)
    if (memo) reached.push(memo)
    const body = memo?.parsed ?? constantByName.get(name)?.parsed
    if (body) collectFreeNames(body, BindingScope.EMPTY, new Set(), pending)
  }
  return reached
}

/** The names `expr` reads that `scope` (or a callback param inside `expr`) does not bind. */
function collectFreeNames(expr: ParsedExpr, scope: BindingScope, into: Set<string>, also?: string[]): void {
  if (expr.kind === 'identifier' && !scope.isBound(expr.name)) {
    into.add(expr.name)
    also?.push(expr.name)
  }
  for (const child of parsedExprChildren(expr)) {
    collectFreeNames(child.expr, child.params ? scope.enterCallback(child.params) : scope, into, also)
  }
}

/** Spell every literal-const member read in a memo body the way an emitter would, for its refusal. */
function spellReads(expr: ParsedExpr, scope: BindingScope, constants: ComponentIR['metadata']['localConstants'], sink: StaticConstMemberSink, isCallee = false): void {
  const key = expr.kind === 'member' ? expr.property : expr.kind === 'index-access' ? staticIndexKey(expr.index) : null
  if (!isCallee && key !== null && (expr.kind === 'member' || expr.kind === 'index-access')) {
    spellStaticConstMember(expr.object, key, constants, name => scope.isBound(name), sink)
  }
  for (const child of parsedExprChildren(expr)) {
    const at = child.params ? scope.enterCallback(child.params) : scope
    spellReads(child.expr, at, constants, sink, expr.kind === 'call' && child.expr === expr.callee)
  }
}
