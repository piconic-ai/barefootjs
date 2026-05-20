/**
 * Expression Parser for BarefootJS
 *
 * Parses JavaScript expressions into a structured AST-like representation
 * using TypeScript Compiler API. This enables proper support detection
 * and conversion to backend template syntax.
 */

import ts from 'typescript'

// =============================================================================
// Parsed Expression Types
// =============================================================================

export type ParsedExpr =
  | { kind: 'identifier'; name: string }
  | { kind: 'literal'; value: string | number | boolean | null; literalType: 'string' | 'number' | 'boolean' | 'null' }
  | { kind: 'call'; callee: ParsedExpr; args: ParsedExpr[] }
  | { kind: 'member'; object: ParsedExpr; property: string; computed: boolean }
  | { kind: 'binary'; op: string; left: ParsedExpr; right: ParsedExpr }
  | { kind: 'unary'; op: string; argument: ParsedExpr }
  | { kind: 'conditional'; test: ParsedExpr; consequent: ParsedExpr; alternate: ParsedExpr }
  | { kind: 'logical'; op: '&&' | '||' | '??'; left: ParsedExpr; right: ParsedExpr }
  | { kind: 'template-literal'; parts: TemplatePart[] }
  | { kind: 'arrow-fn'; param: string; body: ParsedExpr }
  | { kind: 'higher-order'; method: 'filter' | 'every' | 'some' | 'find' | 'findIndex'; object: ParsedExpr; param: string; predicate: ParsedExpr }
  | { kind: 'array-literal'; elements: ParsedExpr[] }
  | { kind: 'unsupported'; raw: string; reason: string }

export type TemplatePart =
  | { type: 'string'; value: string }
  | { type: 'expression'; expr: ParsedExpr }

// =============================================================================
// Parsed Statement Types (for block body arrow functions)
// =============================================================================

export type ParsedStatement =
  | { kind: 'var-decl'; name: string; init: ParsedExpr }
  | { kind: 'return'; value: ParsedExpr }
  | {
      kind: 'if';
      condition: ParsedExpr;
      consequent: ParsedStatement[];
      alternate?: ParsedStatement[];  // else / else if chain
    }

// =============================================================================
// Support Level Classification
// =============================================================================

export type SupportLevel =
  | 'L1' // Simple identifiers and signals: count(), name
  | 'L2' // Member access and .length: user.name, items().length
  | 'L3' // Comparison operators: count() > 0, filter() === 'all'
  | 'L4' // Logical operators: a && b, !isLoading()
  | 'L5' // Higher-order functions with simple predicates: items().filter(x => !x.done).length
  | 'L5_UNSUPPORTED' // Higher-order functions with complex predicates

export interface SupportResult {
  supported: boolean
  level?: SupportLevel
  reason?: string
}

// Higher-order array methods that are not supported
const UNSUPPORTED_METHODS = new Set([
  'filter', 'map', 'reduce', 'reduceRight', 'every', 'some',
  'findLast', 'findLastIndex',
  'forEach', 'flatMap', 'flat',
])

// =============================================================================
// Expression Parser
// =============================================================================

/**
 * Parse a JavaScript expression string into a ParsedExpr tree.
 */
export function parseExpression(expr: string): ParsedExpr {
  const trimmed = expr.trim()
  if (!trimmed) {
    return { kind: 'unsupported', raw: expr, reason: 'Empty expression' }
  }

  // Create a minimal source file containing just the expression
  const sourceFile = ts.createSourceFile(
    'expression.ts',
    trimmed,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )

  // Get the first statement which should be an expression statement
  if (sourceFile.statements.length === 0) {
    return { kind: 'unsupported', raw: expr, reason: 'No statements found' }
  }

  const firstStmt = sourceFile.statements[0]
  if (!ts.isExpressionStatement(firstStmt)) {
    return { kind: 'unsupported', raw: expr, reason: 'Not an expression statement' }
  }

  return convertNode(firstStmt.expression, expr)
}

/**
 * Convert a TypeScript AST node to ParsedExpr.
 */
function convertNode(node: ts.Node, raw: string): ParsedExpr {
  // Identifier: count, name, items
  if (ts.isIdentifier(node)) {
    return { kind: 'identifier', name: node.text }
  }

  // String literal: 'all', "completed"
  if (ts.isStringLiteral(node)) {
    return { kind: 'literal', value: node.text, literalType: 'string' }
  }

  // Numeric literal: 0, 5, 3.14
  if (ts.isNumericLiteral(node)) {
    const value = parseFloat(node.text)
    return { kind: 'literal', value, literalType: 'number' }
  }

  // Boolean literals and null
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return { kind: 'literal', value: true, literalType: 'boolean' }
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return { kind: 'literal', value: false, literalType: 'boolean' }
  }
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return { kind: 'literal', value: null, literalType: 'null' }
  }

  // Call expression: count(), items(), filter()
  if (ts.isCallExpression(node)) {
    const callee = convertNode(node.expression, raw)
    const args = node.arguments.map(arg => convertNode(arg, raw))

    // Detect higher-order methods: arr.filter(x => pred), arr.every(x => pred), arr.some(x => pred)
    if (callee.kind === 'member' && ['filter', 'every', 'some', 'find', 'findIndex'].includes(callee.property)) {
      if (args.length === 1 && args[0].kind === 'arrow-fn') {
        const arrowFn = args[0] as { kind: 'arrow-fn'; param: string; body: ParsedExpr }
        return {
          kind: 'higher-order',
          method: callee.property as 'filter' | 'every' | 'some' | 'find' | 'findIndex',
          object: callee.object,
          param: arrowFn.param,
          predicate: arrowFn.body,
        }
      }
      // .filter(Boolean) — non-arrow callable with a fixed JS semantic
      // (the identity-truthy predicate). Synthesise the equivalent
      // `x => x` so adapters can re-use their existing higher-order
      // lowering instead of needing a separate callee-resolution path.
      // Other identifier-callable predicates would need #1389-style
      // user-supplied callee resolution; out of scope here.
      if (
        callee.property === 'filter' &&
        args.length === 1 &&
        args[0].kind === 'identifier' &&
        args[0].name === 'Boolean'
      ) {
        return {
          kind: 'higher-order',
          method: 'filter',
          object: callee.object,
          param: '_',
          predicate: { kind: 'identifier', name: '_' },
        }
      }
    }

    return { kind: 'call', callee, args }
  }

  // Array literal: [a, b, c]
  if (ts.isArrayLiteralExpression(node)) {
    const elements = node.elements.map(el => convertNode(el, raw))
    return { kind: 'array-literal', elements }
  }

  // Property access: user.name, items().length
  if (ts.isPropertyAccessExpression(node)) {
    const object = convertNode(node.expression, raw)
    const property = node.name.text

    // Return as normal member - filter.length is handled in adapter
    return { kind: 'member', object, property, computed: false }
  }

  // Element access: items[0], obj['key']
  if (ts.isElementAccessExpression(node)) {
    const object = convertNode(node.expression, raw)
    const argNode = node.argumentExpression
    // For simple number/string access, store as property
    if (ts.isNumericLiteral(argNode)) {
      return { kind: 'member', object, property: argNode.text, computed: true }
    }
    if (ts.isStringLiteral(argNode)) {
      return { kind: 'member', object, property: argNode.text, computed: true }
    }
    // Complex computed access
    return { kind: 'unsupported', raw, reason: 'Complex computed property access' }
  }

  // Binary expression: a === b, count > 0, a + b
  if (ts.isBinaryExpression(node)) {
    const left = convertNode(node.left, raw)
    const right = convertNode(node.right, raw)
    const opToken = node.operatorToken

    // Logical operators
    if (opToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      return { kind: 'logical', op: '&&', left, right }
    }
    if (opToken.kind === ts.SyntaxKind.BarBarToken) {
      return { kind: 'logical', op: '||', left, right }
    }
    if (opToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      return { kind: 'logical', op: '??', left, right }
    }

    // Convert operator token to string
    const op = getOperatorString(opToken.kind)
    return { kind: 'binary', op, left, right }
  }

  // Prefix unary expression: !value, -count
  if (ts.isPrefixUnaryExpression(node)) {
    const argument = convertNode(node.operand, raw)
    const op = getUnaryOperatorString(node.operator)
    return { kind: 'unary', op, argument }
  }

  // Conditional expression: cond ? a : b
  if (ts.isConditionalExpression(node)) {
    const test = convertNode(node.condition, raw)
    const consequent = convertNode(node.whenTrue, raw)
    const alternate = convertNode(node.whenFalse, raw)
    return { kind: 'conditional', test, consequent, alternate }
  }

  // Parenthesized expression: (a + b)
  if (ts.isParenthesizedExpression(node)) {
    return convertNode(node.expression, raw)
  }

  // Template literal: `Hello ${name}`
  if (ts.isTemplateExpression(node)) {
    const parts: TemplatePart[] = []
    // Head part
    if (node.head.text) {
      parts.push({ type: 'string', value: node.head.text })
    }
    // Spans (expression + literal pairs)
    for (const span of node.templateSpans) {
      parts.push({ type: 'expression', expr: convertNode(span.expression, raw) })
      if (span.literal.text) {
        parts.push({ type: 'string', value: span.literal.text })
      }
    }
    return { kind: 'template-literal', parts }
  }

  // No-substitution template literal: `hello`
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return { kind: 'literal', value: node.text, literalType: 'string' }
  }

  // Arrow function: x => expr
  if (ts.isArrowFunction(node)) {
    // Only support single parameter without destructuring
    if (node.parameters.length !== 1) {
      return { kind: 'unsupported', raw, reason: 'Only single parameter arrow functions are supported' }
    }
    const param = node.parameters[0]
    if (!ts.isIdentifier(param.name)) {
      return { kind: 'unsupported', raw, reason: 'Destructuring parameters are not supported' }
    }
    const paramName = param.name.text

    // Only expression body is supported (not block body)
    if (ts.isBlock(node.body)) {
      return { kind: 'unsupported', raw, reason: 'Block body arrow functions are not supported' }
    }

    const body = convertNode(node.body, raw)
    return { kind: 'arrow-fn', param: paramName, body }
  }

  // Function expression (unsupported)
  if (ts.isFunctionExpression(node)) {
    return { kind: 'unsupported', raw, reason: 'Function expressions cannot be evaluated at SSR time' }
  }

  // Default: unsupported
  return { kind: 'unsupported', raw, reason: `Unsupported syntax: ${ts.SyntaxKind[node.kind]}` }
}

/**
 * Convert TypeScript binary operator to string representation.
 */
function getOperatorString(kind: ts.SyntaxKind): string {
  switch (kind) {
    // Comparison
    case ts.SyntaxKind.EqualsEqualsToken: return '=='
    case ts.SyntaxKind.EqualsEqualsEqualsToken: return '==='
    case ts.SyntaxKind.ExclamationEqualsToken: return '!='
    case ts.SyntaxKind.ExclamationEqualsEqualsToken: return '!=='
    case ts.SyntaxKind.GreaterThanToken: return '>'
    case ts.SyntaxKind.LessThanToken: return '<'
    case ts.SyntaxKind.GreaterThanEqualsToken: return '>='
    case ts.SyntaxKind.LessThanEqualsToken: return '<='

    // Arithmetic
    case ts.SyntaxKind.PlusToken: return '+'
    case ts.SyntaxKind.MinusToken: return '-'
    case ts.SyntaxKind.AsteriskToken: return '*'
    case ts.SyntaxKind.SlashToken: return '/'
    case ts.SyntaxKind.PercentToken: return '%'

    default: return 'unknown'
  }
}

/**
 * Convert TypeScript prefix unary operator to string representation.
 */
function getUnaryOperatorString(op: ts.PrefixUnaryOperator): string {
  switch (op) {
    case ts.SyntaxKind.ExclamationToken: return '!'
    case ts.SyntaxKind.MinusToken: return '-'
    case ts.SyntaxKind.PlusToken: return '+'
    case ts.SyntaxKind.TildeToken: return '~'
    default: return 'unknown'
  }
}

// =============================================================================
// Support Checking
// =============================================================================

/**
 * Check if a parsed expression is supported for SSR template conversion.
 */
export function isSupported(expr: ParsedExpr): SupportResult {
  return checkSupport(expr)
}

function checkSupport(expr: ParsedExpr): SupportResult {
  switch (expr.kind) {
    case 'unsupported':
      return { supported: false, reason: expr.reason }

    case 'identifier':
      return { supported: true, level: 'L1' }

    case 'literal':
      return { supported: true, level: 'L1' }

    case 'arrow-fn': {
      // Arrow functions are only supported as arguments to higher-order methods
      // They shouldn't appear standalone in supported contexts
      return { supported: false, reason: 'Standalone arrow functions are not supported' }
    }

    case 'higher-order': {
      // Check if predicate uses L1-L4 features
      const predSupport = checkSupport(expr.predicate)
      if (!predSupport.supported) {
        return {
          supported: false,
          level: 'L5_UNSUPPORTED',
          reason: `Higher-order method '${expr.method}()' with complex predicate. ${predSupport.reason || 'Simplify the predicate.'}`,
        }
      }
      // Nested higher-order (e.g., arr.filter(...).filter(...)) is not supported
      if (containsHigherOrder(expr.predicate)) {
        return {
          supported: false,
          level: 'L5_UNSUPPORTED',
          reason: `Nested higher-order methods are not supported. Use @client directive.`,
        }
      }
      // The source array also has to be lowerable. Skipping this check
      // (matching the pre-#1443 behaviour) silently let `array-literal`
      // sources fall through to the adapter's `unsupported` arm and
      // through the regex pipeline — the recursion that #1421 / #1427
      // worked around.
      const objSupport = checkSupport(expr.object)
      if (!objSupport.supported) {
        return objSupport
      }
      return { supported: true, level: 'L5' }
    }

    case 'array-literal': {
      // Array literal is lowerable iff every element is. Adapters that
      // don't have an array-literal form in their template language
      // (Go templates) still need to refuse it — they do so in their
      // own `arrayLiteral` emitter method, not here, because we can't
      // see which adapter is consuming the IR at this point.
      for (const el of expr.elements) {
        const elSupport = checkSupport(el)
        if (!elSupport.supported) return elSupport
      }
      return { supported: true, level: 'L2' }
    }


    case 'call': {
      // Check if callee is supported
      const calleeSupport = checkSupport(expr.callee)
      if (!calleeSupport.supported) {
        return calleeSupport
      }

      // Check for higher-order array methods: items().filter(...)
      // This handles the case where the pattern wasn't recognized as higher-order
      if (expr.callee.kind === 'member') {
        const methodName = expr.callee.property
        if (UNSUPPORTED_METHODS.has(methodName)) {
          return {
            supported: false,
            level: 'L5_UNSUPPORTED',
            reason: `Higher-order method '${methodName}()' requires client-side evaluation. Use @client directive or pre-compute in Go.`,
          }
        }
      }

      // Signal calls like count() with no args are L1
      if (expr.callee.kind === 'identifier' && expr.args.length === 0) {
        return { supported: true, level: 'L1' }
      }

      // Other function calls - check args
      for (const arg of expr.args) {
        const argSupport = checkSupport(arg)
        if (!argSupport.supported) {
          return argSupport
        }
      }
      return { supported: true, level: 'L2' }
    }

    case 'member': {
      const objSupport = checkSupport(expr.object)
      if (!objSupport.supported) {
        return objSupport
      }
      // .length is L2
      if (expr.property === 'length') {
        return { supported: true, level: 'L2' }
      }
      return { supported: true, level: 'L2' }
    }

    case 'binary': {
      const leftSupport = checkSupport(expr.left)
      if (!leftSupport.supported) return leftSupport
      const rightSupport = checkSupport(expr.right)
      if (!rightSupport.supported) return rightSupport

      // Comparison operators are L3
      if (['===', '==', '!==', '!=', '>', '<', '>=', '<='].includes(expr.op)) {
        return { supported: true, level: 'L3' }
      }

      // Arithmetic operators are L3
      if (['+', '-', '*', '/', '%'].includes(expr.op)) {
        return { supported: true, level: 'L3' }
      }

      return { supported: false, reason: `Unknown operator: ${expr.op}` }
    }

    case 'unary': {
      const argSupport = checkSupport(expr.argument)
      if (!argSupport.supported) return argSupport

      // Negation is L4
      if (expr.op === '!') {
        return { supported: true, level: 'L4' }
      }
      // Numeric negation is L3
      if (expr.op === '-' || expr.op === '+') {
        return { supported: true, level: 'L3' }
      }

      return { supported: false, reason: `Unsupported unary operator: ${expr.op}` }
    }

    case 'logical': {
      const leftSupport = checkSupport(expr.left)
      if (!leftSupport.supported) return leftSupport
      const rightSupport = checkSupport(expr.right)
      if (!rightSupport.supported) return rightSupport

      return { supported: true, level: 'L4' }
    }

    case 'conditional': {
      const testSupport = checkSupport(expr.test)
      if (!testSupport.supported) return testSupport
      const consSupport = checkSupport(expr.consequent)
      if (!consSupport.supported) return consSupport
      const altSupport = checkSupport(expr.alternate)
      if (!altSupport.supported) return altSupport

      return { supported: true, level: 'L4' }
    }

    case 'template-literal': {
      for (const part of expr.parts) {
        if (part.type === 'expression') {
          const partSupport = checkSupport(part.expr)
          if (!partSupport.supported) return partSupport
        }
      }
      return { supported: true, level: 'L2' }
    }

    default:
      return { supported: false, reason: 'Unknown expression kind' }
  }
}

/**
 * Check if expression contains any higher-order method calls.
 */
export function containsHigherOrder(expr: ParsedExpr): boolean {
  switch (expr.kind) {
    case 'higher-order':
      return true
    case 'call':
      return expr.args.some(containsHigherOrder) || containsHigherOrder(expr.callee)
    case 'member':
      return containsHigherOrder(expr.object)
    case 'binary':
      return containsHigherOrder(expr.left) || containsHigherOrder(expr.right)
    case 'unary':
      return containsHigherOrder(expr.argument)
    case 'logical':
      return containsHigherOrder(expr.left) || containsHigherOrder(expr.right)
    case 'conditional':
      return containsHigherOrder(expr.test) || containsHigherOrder(expr.consequent) || containsHigherOrder(expr.alternate)
    case 'arrow-fn':
      return containsHigherOrder(expr.body)
    case 'array-literal':
      return expr.elements.some(containsHigherOrder)
    default:
      return false
  }
}

// =============================================================================
// Debug Helper
// =============================================================================

// =============================================================================
// Block Body Parser (for arrow functions with block body)
// =============================================================================

/**
 * Parse a block body into ParsedStatement array.
 * Used for filter predicates with block bodies like:
 * ```
 * filter(t => {
 *   const f = filter()
 *   if (f === 'active') return !t.done
 *   return true
 * })
 * ```
 */
export function parseBlockBody(
  block: ts.Block,
  sourceFile: ts.SourceFile,
  getJS: (node: ts.Node) => string
): ParsedStatement[] | null {
  const statements: ParsedStatement[] = []

  for (const stmt of block.statements) {
    const parsed = parseStatement(stmt, sourceFile, getJS)
    if (parsed === null) {
      // Unsupported statement type
      return null
    }
    statements.push(parsed)
  }

  return statements
}

/**
 * Parse a single statement into ParsedStatement.
 */
function parseStatement(
  stmt: ts.Statement,
  sourceFile: ts.SourceFile,
  getJS: (node: ts.Node) => string
): ParsedStatement | null {
  // Variable declaration: const f = filter()
  if (ts.isVariableStatement(stmt)) {
    const decl = stmt.declarationList.declarations[0]
    if (!decl || !ts.isIdentifier(decl.name) || !decl.initializer) {
      return null
    }
    const name = decl.name.text
    const initText = getJS(decl.initializer)
    const init = parseExpression(initText)
    if (init.kind === 'unsupported') {
      return null
    }
    return { kind: 'var-decl', name, init }
  }

  // Return statement: return !t.done
  if (ts.isReturnStatement(stmt)) {
    if (!stmt.expression) {
      // return; (no value) -> return undefined, treat as return true
      return { kind: 'return', value: { kind: 'literal', value: true, literalType: 'boolean' } }
    }
    const valueText = getJS(stmt.expression)
    const value = parseExpression(valueText)
    if (value.kind === 'unsupported') {
      return null
    }
    return { kind: 'return', value }
  }

  // If statement: if (f === 'active') return !t.done
  if (ts.isIfStatement(stmt)) {
    const conditionText = getJS(stmt.expression)
    const condition = parseExpression(conditionText)
    if (condition.kind === 'unsupported') {
      return null
    }

    // Parse consequent (then branch)
    const consequent = parseIfBranch(stmt.thenStatement, sourceFile, getJS)
    if (consequent === null) {
      return null
    }

    // Parse alternate (else branch) if present
    let alternate: ParsedStatement[] | undefined
    if (stmt.elseStatement) {
      // else if -> recurse as if statement
      if (ts.isIfStatement(stmt.elseStatement)) {
        const elseIf = parseStatement(stmt.elseStatement, sourceFile, getJS)
        if (elseIf === null) {
          return null
        }
        alternate = [elseIf]
      } else {
        // else { ... }
        const elseBranch = parseIfBranch(stmt.elseStatement, sourceFile, getJS)
        if (elseBranch === null) {
          return null
        }
        alternate = elseBranch
      }
    }

    return { kind: 'if', condition, consequent, alternate }
  }

  // Unsupported statement (for, while, switch, etc.)
  return null
}

/**
 * Parse an if branch (then or else) into ParsedStatement array.
 */
function parseIfBranch(
  branch: ts.Statement,
  sourceFile: ts.SourceFile,
  getJS: (node: ts.Node) => string
): ParsedStatement[] | null {
  // Block: { ... }
  if (ts.isBlock(branch)) {
    return parseBlockBody(branch, sourceFile, getJS)
  }

  // Single statement (no braces): return !t.done
  const parsed = parseStatement(branch, sourceFile, getJS)
  if (parsed === null) {
    return null
  }
  return [parsed]
}

/**
 * Convert ParsedExpr back to a string for debugging.
 */
export function exprToString(expr: ParsedExpr): string {
  switch (expr.kind) {
    case 'identifier':
      return expr.name
    case 'literal':
      if (expr.literalType === 'string') return `"${expr.value}"`
      if (expr.value === null) return 'null'
      return String(expr.value)
    case 'call':
      return `${exprToString(expr.callee)}(${expr.args.map(exprToString).join(', ')})`
    case 'member':
      return `${exprToString(expr.object)}.${expr.property}`
    case 'binary':
      return `${exprToString(expr.left)} ${expr.op} ${exprToString(expr.right)}`
    case 'unary':
      return `${expr.op}${exprToString(expr.argument)}`
    case 'logical':
      return `${exprToString(expr.left)} ${expr.op} ${exprToString(expr.right)}`
    case 'conditional':
      return `${exprToString(expr.test)} ? ${exprToString(expr.consequent)} : ${exprToString(expr.alternate)}`
    case 'template-literal':
      return '`' + expr.parts.map(p =>
        p.type === 'string' ? p.value : `\${${exprToString(p.expr)}}`
      ).join('') + '`'
    case 'arrow-fn':
      return `${expr.param} => ${exprToString(expr.body)}`
    case 'higher-order':
      return `${exprToString(expr.object)}.${expr.method}(${expr.param} => ${exprToString(expr.predicate)})`
    case 'array-literal':
      return `[${expr.elements.map(exprToString).join(', ')}]`
    case 'unsupported':
      return `[UNSUPPORTED: ${expr.raw}]`
  }
}

/**
 * Round-trip a ParsedExpr back to JS source text. Unlike `exprToString`
 * (which is a debug formatter), this aims for lossless re-parsing:
 * string literals are JSON-escaped, computed-member keys preserve
 * their quoted form, and unsupported nodes pass through their raw
 * source. Used by adapter-side AST rewrites (templatePrimitives
 * substitution, etc.) where the result must be re-fed into a
 * downstream conversion pipeline.
 */
export function stringifyParsedExpr(expr: ParsedExpr): string {
  switch (expr.kind) {
    case 'identifier':
      return expr.name
    case 'literal':
      if (expr.literalType === 'string') return JSON.stringify(expr.value)
      if (expr.literalType === 'null') return 'null'
      return String(expr.value)
    case 'call':
      return `${stringifyParsedExpr(expr.callee)}(${expr.args.map(stringifyParsedExpr).join(', ')})`
    case 'member': {
      const obj = stringifyParsedExpr(expr.object)
      if (!expr.computed) return `${obj}.${expr.property}`
      // Numeric indices round-trip verbatim (`arr[0]`); string keys
      // need quoting so `obj['key']` doesn't degrade to `obj[key]`
      // (a bare-identifier lookup with different semantics).
      const key = /^-?\d+$/.test(expr.property)
        ? expr.property
        : JSON.stringify(expr.property)
      return `${obj}[${key}]`
    }
    case 'binary':
      return `${stringifyParsedExpr(expr.left)} ${expr.op} ${stringifyParsedExpr(expr.right)}`
    case 'unary':
      return `${expr.op}${stringifyParsedExpr(expr.argument)}`
    case 'logical':
      return `${stringifyParsedExpr(expr.left)} ${expr.op} ${stringifyParsedExpr(expr.right)}`
    case 'conditional':
      return `${stringifyParsedExpr(expr.test)} ? ${stringifyParsedExpr(expr.consequent)} : ${stringifyParsedExpr(expr.alternate)}`
    case 'template-literal':
      return '`' + expr.parts.map(p =>
        p.type === 'string' ? p.value : `\${${stringifyParsedExpr(p.expr)}}`
      ).join('') + '`'
    case 'arrow-fn':
      return `${expr.param} => ${stringifyParsedExpr(expr.body)}`
    case 'higher-order':
      return `${stringifyParsedExpr(expr.object)}.${expr.method}(${expr.param} => ${stringifyParsedExpr(expr.predicate)})`
    case 'array-literal':
      return `[${expr.elements.map(stringifyParsedExpr).join(', ')}]`
    case 'unsupported':
      return expr.raw
  }
}

/**
 * Extract the textual identifier path from a parsed expression's
 * callee — `{kind:'identifier', name:'String'}` → `"String"`,
 * `{kind:'member', object:{kind:'identifier', name:'JSON'},
 * property:'stringify'}` → `"JSON.stringify"`. Returns `null` for
 * any other callee shape (call result, computed member, etc.) so
 * adapter `templatePrimitives` registries can match identifier
 * paths exclusively (#1187 R1).
 */
export function identifierPath(callee: ParsedExpr): string | null {
  if (callee.kind === 'identifier') return callee.name
  if (callee.kind === 'member' && !callee.computed) {
    const head = identifierPath(callee.object)
    return head ? `${head}.${callee.property}` : null
  }
  return null
}
