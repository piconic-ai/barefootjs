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
 * render time, and removes the reassigning statements:
 *
 *   let label = ((!(props.label ?? 'Default')) ? ('Fallback') : (props.label ?? 'Default'))
 *
 * Every later stage (the analyzer, the CSR template, the template adapters,
 * the client init body) then sees an ordinary binding with one value, so
 * they agree by construction.
 *
 * The rewrite only applies where it cannot change behaviour:
 *   - the reassigning statements directly follow the declaration, and each
 *     is an assignment to the binding (`x = e`, `x += e`, `x ??= e`, …), an
 *     `if`/`else` whose branches are such assignments, or a block of them;
 *   - the initializer, every assigned value and every condition is free of
 *     side effects (no calls, no assignments, no functions), so evaluating
 *     them at the declaration instead of at their statements yields the same
 *     value.
 * Anything else leaves the binding as it is (and `markMutatedConstants`
 * flags it as before).
 */

import ts from 'typescript'

/** Folded values longer than this are left unfolded: each `if` may repeat the value so far. */
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
  for (const body of topLevelFunctionBodies(sf)) foldBlock(body.statements, sf, edits)
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

function foldBlock(statements: ts.NodeArray<ts.Statement>, sf: ts.SourceFile, edits: Edit[]): void {
  for (let i = 0; i < statements.length; i++) {
    const decl = foldableLet(statements[i]!)
    if (!decl) continue
    const name = decl.name.text
    let current = decl.initializer.getText(sf)
    let last = i
    for (let j = i + 1; j < statements.length; j++) {
      const next = foldStatement(statements[j]!, name, current, sf)
      if (next === null || next.length > MAX_FOLDED_LENGTH) break
      current = next
      last = j
    }
    if (last === i) continue
    const removed = statements.slice(i + 1, last + 1)
    const initText = decl.initializer.getText(sf)
    edits.push({ start: decl.initializer.getStart(sf), end: decl.initializer.getEnd(), text: current })
    const surplus = countNewlines(current) - countNewlines(initText)
    edits.push(...blankStatements(removed, sf, surplus))
    i = last
  }
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

/** The binding's value after `stmt`, given its value `current` before; `null` when `stmt` is not foldable. */
function foldStatement(stmt: ts.Statement, name: string, current: string, sf: ts.SourceFile): string | null {
  if (ts.isEmptyStatement(stmt)) return current
  if (ts.isBlock(stmt)) {
    let value = current
    for (const s of stmt.statements) {
      const next = foldStatement(s, name, value, sf)
      if (next === null) return null
      value = next
    }
    return value
  }
  if (ts.isIfStatement(stmt)) {
    if (!isPure(stmt.expression)) return null
    const whenTrue = foldStatement(stmt.thenStatement, name, current, sf)
    if (whenTrue === null) return null
    const whenFalse = stmt.elseStatement ? foldStatement(stmt.elseStatement, name, current, sf) : current
    if (whenFalse === null) return null
    const test = substitute(stmt.expression, name, current, sf)
    return `((${test}) ? (${whenTrue}) : (${whenFalse}))`
  }
  if (!ts.isExpressionStatement(stmt)) return null
  const expr = skipParens(stmt.expression)
  if (!ts.isBinaryExpression(expr)) return null
  const target = skipParens(expr.left)
  if (!ts.isIdentifier(target) || target.text !== name || !isPure(expr.right)) return null
  const value = substitute(expr.right, name, current, sf)
  if (expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) return value
  const op = COMPOUND_OPERATORS.get(expr.operatorToken.kind)
  return op === undefined ? null : `((${current}) ${op} (${value}))`
}

/** `expr`'s source text with every read of `name` replaced by `(current)`. */
function substitute(expr: ts.Expression, name: string, current: string, sf: ts.SourceFile): string {
  const start = expr.getStart(sf)
  const text = expr.getText(sf)
  const reads: ts.Identifier[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node)) return
    if (ts.isIdentifier(node) && node.text === name && !isPropertyName(node)) reads.push(node)
    ts.forEachChild(node, visit)
  }
  visit(expr)
  let out = text
  for (const id of reads.reverse()) {
    const at = id.getStart(sf) - start
    out = `${out.slice(0, at)}(${current})${out.slice(at + id.text.length)}`
  }
  return out
}

function isPropertyName(id: ts.Identifier): boolean {
  const p = id.parent
  return ts.isPropertyAccessExpression(p) && p.name === id
}

/**
 * Whether evaluating `expr` has no side effects and reads nothing a
 * statement between the declaration and the reassignment could change:
 * identifiers, literals, member reads and operators only.
 */
function isPure(expr: ts.Expression): boolean {
  const e = skipParens(expr)
  if (ts.isIdentifier(e) || ts.isLiteralExpression(e) || ts.isNoSubstitutionTemplateLiteral(e)) return true
  switch (e.kind) {
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NullKeyword:
      return true
  }
  if (ts.isPropertyAccessExpression(e)) return isPure(e.expression)
  if (ts.isElementAccessExpression(e)) return isPure(e.expression) && isPure(e.argumentExpression)
  if (ts.isPrefixUnaryExpression(e)) {
    return (
      e.operator !== ts.SyntaxKind.PlusPlusToken && e.operator !== ts.SyntaxKind.MinusMinusToken && isPure(e.operand)
    )
  }
  if (ts.isTypeOfExpression(e)) return isPure(e.expression)
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind
    const isAssignment = op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment
    return !isAssignment && op !== ts.SyntaxKind.CommaToken && isPure(e.left) && isPure(e.right)
  }
  if (ts.isConditionalExpression(e)) return isPure(e.condition) && isPure(e.whenTrue) && isPure(e.whenFalse)
  if (ts.isTemplateExpression(e)) return e.templateSpans.every(s => isPure(s.expression))
  if (ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) return isPure(e.expression)
  return false
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
