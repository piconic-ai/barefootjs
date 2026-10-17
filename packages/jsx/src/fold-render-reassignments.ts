/**
 * Fold render-time reassignments of a component-scope `let` into its
 * initializer (#3501).
 *
 * A template evaluates a binding's value, never the statements that follow
 * its declaration, so a `let` reassigned before the component returns had
 * no value a template could read:
 *
 *   let label = props.label ?? 'Default'
 *   if (!label) label = 'Fallback'
 *
 * This pre-pass rewrites that to the single value the binding holds at
 * render time, binding each intermediate value once, and removes the
 * reassigning statements:
 *
 *   const label_1 = props.label ?? 'Default'; let label = ((!(label_1)) ? ('Fallback') : (label_1))
 *
 * Every later stage (the analyzer, the CSR template, the template adapters,
 * the client init body) then sees ordinary bindings with one value each, so
 * they agree by construction.
 *
 * The rewrite only applies where it cannot change behaviour:
 *   - the reassigning statements directly follow the declaration, and each
 *     is an assignment to the binding (`x = e`, `x += e`, `x ??= e`, …), an
 *     `if`/`else` whose branches are such assignments, or a block of them;
 *   - the initializer, every assigned value and every condition is free of
 *     side effects (no calls, no assignments, no functions);
 *   - every expression is evaluated exactly as often, and in the same order,
 *     as the original statements evaluate it. Each statement's incoming value
 *     is a binding (a read of it is unobservable) or a literal, and a
 *     conditional evaluates only the branch it takes; inside a statement, a
 *     computed value read more than once on one path is left unfolded, since
 *     repeating it would repeat a member read a getter may observe.
 * Anything else leaves the binding as it is (and `markMutatedConstants`
 * flags it as before).
 */

import ts from 'typescript'

/** Folded values longer than this are left unfolded. */
const MAX_FOLDED_LENGTH = 4000

interface Edit {
  start: number
  end: number
  text: string
}

/**
 * The source with each foldable `let` folded, or `null` when nothing was
 * folded. Line count is preserved where possible (removed statements are
 * blanked rather than deleted), so later source locations stay valid.
 */
export function foldRenderReassignmentsInSource(source: string, filePath: string): string | null {
  if (!source.includes('let ')) return null
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits: Edit[] = []
  const names = new FreshNames(sf)
  for (const body of topLevelFunctionBodies(sf)) foldBlock(body.statements, sf, names, edits)
  if (edits.length === 0) return null
  edits.sort((a, b) => b.start - a.start)
  let out = source
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  return out
}

function topLevelFunctionBodies(sf: ts.SourceFile): ts.Block[] {
  const bodies: ts.Block[] = []
  const add = (fn: ts.Node | undefined) => {
    if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && fn.body && ts.isBlock(fn.body)) bodies.push(fn.body)
  }
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.body) bodies.push(stmt.body)
    else if (ts.isVariableStatement(stmt)) for (const d of stmt.declarationList.declarations) add(d.initializer)
    else if (ts.isExportAssignment(stmt)) add(stmt.expression)
  }
  return bodies
}

/** Identifiers not yet used anywhere in the file, for the intermediate bindings. */
class FreshNames {
  private readonly used = new Set<string>()
  constructor(sf: ts.SourceFile) {
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) this.used.add(node.text)
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  next(base: string): string {
    let k = 1
    while (this.used.has(`${base}_${k}`)) k++
    const name = `${base}_${k}`
    this.used.add(name)
    return name
  }
}

/** A value: its source text, and whether it is a literal or a plain identifier, which may be repeated freely. */
interface Value {
  text: string
  trivial: boolean
}

function foldBlock(statements: ts.NodeArray<ts.Statement>, sf: ts.SourceFile, names: FreshNames, edits: Edit[]): void {
  for (let i = 0; i < statements.length; i++) {
    const decl = foldableLet(statements[i]!)
    if (!decl) continue
    const name = decl.name.text
    // `value` is the binding's value so far. Each statement reads it through
    // a binding of its own (or directly, when it is a literal or identifier),
    // so its expression is evaluated once, where the original evaluated it.
    let value: Value = { text: decl.initializer.getText(sf), trivial: isTrivial(decl.initializer) }
    const bindings: string[] = []
    let last = i
    for (let j = i + 1; j < statements.length; j++) {
      const ref = value.trivial ? value.text : names.next(name)
      const next = foldStatement(statements[j]!, name, { text: ref, trivial: true }, sf)
      if (next === null || next.text.length > MAX_FOLDED_LENGTH) break
      if (!value.trivial) bindings.push(`const ${ref} = ${value.text}; `)
      value = next
      last = j
    }
    if (last === i) continue
    const stmt = statements[i]!
    const initText = decl.initializer.getText(sf)
    const prefix = bindings.join('')
    edits.push({ start: stmt.getStart(sf), end: stmt.getStart(sf), text: prefix })
    edits.push({ start: decl.initializer.getStart(sf), end: decl.initializer.getEnd(), text: value.text })
    const surplus = countNewlines(prefix) + countNewlines(value.text) - countNewlines(initText)
    edits.push(...blankStatements(statements.slice(i + 1, last + 1), sf, surplus))
    i = last
  }
}

function isTrivial(expr: ts.Expression): boolean {
  return PURE_LEAF_KINDS.has(skipParens(expr).kind)
}

/** `let x = <pure initializer>` with a single identifier binding. */
function foldableLet(stmt: ts.Statement): (ts.VariableDeclaration & { name: ts.Identifier; initializer: ts.Expression }) | null {
  if (!ts.isVariableStatement(stmt)) return null
  const list = stmt.declarationList
  if (!(list.flags & ts.NodeFlags.Let) || list.declarations.length !== 1) return null
  const d = list.declarations[0]!
  if (!ts.isIdentifier(d.name) || !d.initializer || !isPure(d.initializer)) return null
  return d as ts.VariableDeclaration & { name: ts.Identifier; initializer: ts.Expression }
}

const COMPOUND_OPERATORS = new Map<ts.SyntaxKind, string>([
  [ts.SyntaxKind.PlusEqualsToken, '+'],
  [ts.SyntaxKind.MinusEqualsToken, '-'],
  [ts.SyntaxKind.AsteriskEqualsToken, '*'],
  [ts.SyntaxKind.SlashEqualsToken, '/'],
  [ts.SyntaxKind.PercentEqualsToken, '%'],
  [ts.SyntaxKind.QuestionQuestionEqualsToken, '??'],
  [ts.SyntaxKind.BarBarEqualsToken, '||'],
  [ts.SyntaxKind.AmpersandAmpersandEqualsToken, '&&'],
])

/**
 * A statement's effect on the binding: its value afterwards, and the most
 * times one path through it evaluates the incoming value.
 */
interface Folded extends Value {
  reads: number
}

/**
 * The binding's value after `stmt`, given its value `current` before; `null`
 * when `stmt` is not foldable, or when it would evaluate a computed
 * `current` more than once on one path.
 */
function foldStatement(stmt: ts.Statement, name: string, current: Value, sf: ts.SourceFile): Folded | null {
  const folded = foldStatementUnchecked(stmt, name, current, sf)
  return folded !== null && (current.trivial || folded.reads <= 1) ? folded : null
}

function foldStatementUnchecked(stmt: ts.Statement, name: string, current: Value, sf: ts.SourceFile): Folded | null {
  if (ts.isEmptyStatement(stmt)) return { ...current, reads: 1 }
  if (ts.isBlock(stmt)) return foldSequence(stmt.statements, name, current, sf)
  if (ts.isIfStatement(stmt)) return foldIf(stmt, name, current, sf)
  if (!ts.isExpressionStatement(stmt)) return null
  const expr = skipParens(stmt.expression)
  if (!ts.isBinaryExpression(expr)) return null
  const target = skipParens(expr.left)
  if (!ts.isIdentifier(target) || target.text !== name || !isPure(expr.right)) return null
  const value = substitute(expr.right, name, current.text, sf)
  if (expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return { text: value.text, reads: value.reads, trivial: value.reads === 0 && isTrivial(expr.right) }
  }
  const op = COMPOUND_OPERATORS.get(expr.operatorToken.kind)
  if (op === undefined) return null
  return { text: `((${current.text}) ${op} (${value.text}))`, reads: 1 + value.reads, trivial: false }
}

/** Statements in order: each reads the value the previous one left. */
function foldSequence(stmts: readonly ts.Statement[], name: string, current: Value, sf: ts.SourceFile): Folded | null {
  let value: Folded = { ...current, reads: 1 }
  for (const s of stmts) {
    const next = foldStatement(s, name, value, sf)
    if (next === null) return null
    value = { ...next, reads: next.reads * value.reads }
  }
  return value
}

/** A conditional evaluates its test, then only the branch it takes. */
function foldIf(stmt: ts.IfStatement, name: string, current: Value, sf: ts.SourceFile): Folded | null {
  if (!isPure(stmt.expression)) return null
  const whenTrue = foldStatement(stmt.thenStatement, name, current, sf)
  if (whenTrue === null) return null
  const whenFalse = stmt.elseStatement ? foldStatement(stmt.elseStatement, name, current, sf) : { ...current, reads: 1 }
  if (whenFalse === null) return null
  const test = substitute(stmt.expression, name, current.text, sf)
  return {
    text: `((${test.text}) ? (${whenTrue.text}) : (${whenFalse.text}))`,
    reads: test.reads + Math.max(whenTrue.reads, whenFalse.reads),
    trivial: false,
  }
}

/** `expr`'s source text with every read of `name` replaced by `(current)`, and how many reads there were. */
function substitute(expr: ts.Expression, name: string, current: string, sf: ts.SourceFile): { text: string; reads: number } {
  const start = expr.getStart(sf)
  const reads: ts.Identifier[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node)) return
    if (ts.isIdentifier(node) && node.text === name && !isPropertyName(node)) reads.push(node)
    ts.forEachChild(node, visit)
  }
  visit(expr)
  let out = expr.getText(sf)
  for (const id of [...reads].reverse()) {
    const at = id.getStart(sf) - start
    out = `${out.slice(0, at)}(${current})${out.slice(at + id.text.length)}`
  }
  return { text: out, reads: reads.length }
}

function isPropertyName(id: ts.Identifier): boolean {
  const p = id.parent
  return ts.isPropertyAccessExpression(p) && p.name === id
}

const PURE_LEAF_KINDS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.BigIntLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
])

/**
 * Whether evaluating `expr` has no side effects and reads nothing a
 * statement between the declaration and the reassignment could change:
 * identifiers, literals, member reads and operators only.
 */
function isPure(expr: ts.Expression): boolean {
  const e = skipParens(expr)
  if (PURE_LEAF_KINDS.has(e.kind)) return true
  const operands = pureOperands(e)
  return operands !== null && operands.every(isPure)
}

/** The sub-expressions of a side-effect-free form, or `null` for any other form. */
function pureOperands(e: ts.Expression): readonly ts.Expression[] | null {
  if (ts.isPropertyAccessExpression(e) || ts.isTypeOfExpression(e)) return [e.expression]
  if (ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) return [e.expression]
  if (ts.isElementAccessExpression(e)) return [e.expression, e.argumentExpression]
  if (ts.isConditionalExpression(e)) return [e.condition, e.whenTrue, e.whenFalse]
  if (ts.isTemplateExpression(e)) return e.templateSpans.map(s => s.expression)
  if (ts.isPrefixUnaryExpression(e)) {
    const sideEffect = e.operator === ts.SyntaxKind.PlusPlusToken || e.operator === ts.SyntaxKind.MinusMinusToken
    return sideEffect ? null : [e.operand]
  }
  if (ts.isBinaryExpression(e)) return isPureOperator(e.operatorToken.kind) ? [e.left, e.right] : null
  return null
}

/** A binary operator that neither assigns nor sequences. */
function isPureOperator(op: ts.SyntaxKind): boolean {
  const isAssignment = op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment
  return !isAssignment && op !== ts.SyntaxKind.CommaToken
}

function skipParens(expr: ts.Expression): ts.Expression {
  let e = expr
  while (ts.isParenthesizedExpression(e)) e = e.expression
  return e
}

function countNewlines(text: string): number {
  let n = 0
  for (const ch of text) if (ch === '\n') n++
  return n
}

/**
 * Blank each removed statement to spaces, keeping its newlines so later
 * lines keep their numbers. `surplus` newlines the folded initializer added
 * are taken back out of the blanked text (or, when negative, added to it).
 */
function blankStatements(stmts: readonly ts.Statement[], sf: ts.SourceFile, surplus: number): Edit[] {
  let pending = surplus
  return stmts.map((s, k) => {
    let text = ''
    for (const ch of s.getText(sf)) {
      if (ch !== '\n') text += ' '
      else if (pending > 0) pending--
      else text += '\n'
    }
    if (k === stmts.length - 1 && pending < 0) text += '\n'.repeat(-pending)
    return { start: s.getStart(sf), end: s.getEnd(), text }
  })
}
