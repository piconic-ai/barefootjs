/**
 * The component declarations the server render evaluates: what a template
 * position reads, followed transitively through the declarations it names.
 *
 * Every backend evaluates a memo, constant or local function it renders
 * (the rule `checkAsyncActionReads`, BF117, states for a query action), so a
 * read inside one of their bodies is a server-render read when some
 * server-rendered position reaches the declaration: by reading the memo or
 * constant, calling the function, or naming another declaration that does.
 * The positions are `walkTemplatePositions`'s, which skips a
 * `/* @client *\/` position: what only such positions reach runs in the
 * browser. A module-scope memo runs in the client bundle only and is never
 * reached. JSX-valued constants and functions are left out: they are
 * inlined into the IR, where the position walk sees their reads directly.
 *
 * BF117 answers the inverse question (which declarations reach an action)
 * with its own fixpoint over the same free identifiers; this is the forward
 * walk, from the positions.
 */

import { parsedExprChildren } from './action-accessor.ts'
import type { ParsedExpr, ParsedStatement } from './expression-parser.ts'
import type { BindingScope } from './scope/binding-scope.ts'
import { walkTemplatePositions } from './template-position-walk.ts'
import type { ComponentIR, ConstantInfo, FunctionInfo, MemoInfo, SourceLocation } from './types.ts'

/** One template position the server render evaluates. */
export interface SsrPosition {
  expr: ParsedExpr
  loc: SourceLocation
  scope: BindingScope
}

/** The server-rendered positions and the declarations they reach. */
export interface SsrReads {
  positions: SsrPosition[]
  memos: MemoInfo[]
  constants: ConstantInfo[]
  functions: FunctionInfo[]
}

/** `ir`'s server-rendered positions, read in `component`'s scope at the top level, and the declarations they reach. */
export function ssrReads(ir: ComponentIR, component: BindingScope): SsrReads {
  const positions: SsrPosition[] = []
  const read = new Set<string>()
  walkTemplatePositions(ir.root, ({ expr, loc, scope }) => {
    positions.push({ expr, loc, scope: scope ?? component })
    collectNames(expr, read)
  }, component)
  return { positions, ...reachedDeclarations(ir.metadata, read) }
}

function reachedDeclarations(metadata: ComponentIR['metadata'], read: ReadonlySet<string>): Omit<SsrReads, 'positions'> {
  const memos = new Map((metadata.memos ?? []).filter(m => !m.isModule).map(m => [m.name, m]))
  const constants = new Map(
    (metadata.localConstants ?? []).filter(c => !c.isJsx && !c.isJsxFunction).map(c => [c.name, c]),
  )
  const functions = new Map((metadata.localFunctions ?? []).filter(f => !f.isJsxFunction).map(f => [f.name, f]))
  const reached: Omit<SsrReads, 'positions'> = { memos: [], constants: [], functions: [] }
  const visited = new Set<string>()
  const pending = [...read]
  while (pending.length > 0) {
    const name = pending.pop()!
    if (visited.has(name)) continue
    visited.add(name)
    const memo = memos.get(name)
    const constant = memo ? undefined : constants.get(name)
    const fn = memo || constant ? undefined : functions.get(name)
    if (memo) reached.memos.push(memo)
    if (constant) reached.constants.push(constant)
    if (fn) reached.functions.push(fn)
    const declaration = memo ?? constant ?? fn
    if (declaration) pending.push(...namesRead(declaration))
  }
  return reached
}

/**
 * The names a declaration reads: its recorded free identifiers, else every
 * identifier in its parse. The recorded set is only trusted as a `Set`: an IR
 * that went through a JSON round trip (a cached compile) carries it as `{}`.
 */
function namesRead(declaration: MemoInfo | ConstantInfo | FunctionInfo): Iterable<string> {
  const free = 'computation' in declaration ? declaration.computationFreeIdentifiers : declaration.freeIdentifiers
  if (free instanceof Set) return free
  const names = new Set<string>()
  for (const expr of declarationExprs(declaration)) collectNames(expr, names)
  return names
}

/** The expressions a memo, constant or function body evaluates, as far as its parse represents them. */
export function declarationExprs(declaration: MemoInfo | ConstantInfo | FunctionInfo): ParsedExpr[] {
  const parsed = 'parsed' in declaration ? declaration.parsed : undefined
  if (parsed) return [parsed]
  return 'parsedBlock' in declaration ? statementExprs(declaration.parsedBlock ?? []) : []
}

/** The names a function body binds itself: its parameters and its `const` / `let` locals. */
export function functionLocalNames(fn: FunctionInfo): string[] {
  const names = fn.params.map(p => p.name)
  const visit = (statements: readonly ParsedStatement[]): void => {
    for (const s of statements) {
      if (s.kind === 'var-decl') names.push(s.name)
      else if (s.kind === 'if') {
        visit(s.consequent)
        if (s.alternate) visit(s.alternate)
      }
    }
  }
  visit(fn.parsedBlock ?? [])
  return names
}

/** The expressions in parsed statements, nested `if` blocks included. */
function statementExprs(statements: readonly ParsedStatement[]): ParsedExpr[] {
  const out: ParsedExpr[] = []
  for (const s of statements) {
    if (s.kind === 'var-decl') out.push(s.init)
    else if (s.kind === 'return') out.push(s.value)
    else {
      out.push(s.condition, ...statementExprs(s.consequent))
      if (s.alternate) out.push(...statementExprs(s.alternate))
    }
  }
  return out
}

/** Every identifier `expr` names (an over-approximation of its free names: a callback param counts too). */
function collectNames(expr: ParsedExpr, into: Set<string>): void {
  if (expr.kind === 'identifier') into.add(expr.name)
  for (const child of parsedExprChildren(expr)) collectNames(child.expr, into)
}
