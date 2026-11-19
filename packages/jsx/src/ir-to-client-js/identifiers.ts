/**
 * Token-level identifier extraction for expression strings and template
 * literals. Used by `build-references.ts` to populate the component's
 * `ReferencesGraph`.
 *
 * Pre-#1021 this file also housed three compound collectors
 * (`collectUsedIdentifiers`, `collectUsedFunctions`,
 * `collectIdentifiersFromIRTree`) that walked `ClientJsContext` + the
 * IR tree to produce `usedIdentifiers` for `generate-init.ts`. Those
 * are gone — callers now query the graph. See
 * issue #1021 Stage B for the rationale.
 */

import ts from 'typescript'
import { isIdentifierLikeToken, isTriviaKind, iterateJsTokens } from '../scanner/js-scanner.ts'
import { extractFreeIdentifiersFromNode } from '../analyzer.ts'

/** JavaScript keywords and common globals to skip during identifier extraction. */
const KEYWORDS_AND_GLOBALS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'this',
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'new',
  'typeof',
  'instanceof',
  'void',
  'delete',
  'console',
  'window',
  'document',
  'Math',
  'String',
  'Number',
  'Array',
  'Object',
  'Boolean',
  'Date',
  'JSON',
  'Promise',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
])

/**
 * Words that can never name a binding in module (strict) code. Every other
 * identifier-or-keyword token, contextual keywords included (`type`, `of`,
 * `get`, …), can.
 */
const RESERVED_WORDS = new Set([
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'implements', 'import',
  'in', 'instanceof', 'interface', 'let', 'new', 'null', 'package', 'private', 'protected', 'public',
  'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while',
  'with', 'yield',
])

/**
 * Walk the tokens of `text` (`iterateJsTokens`, the shared JS lexer, which
 * reads a regex literal as one token and closes template substitutions at
 * their own `}`), calling `onName` for every identifier, member names
 * included (`props.value` yields both: the reference graph reads a
 * props-object member as a use of that prop), and `onSubstitution` with the
 * source span of every outermost `${…}` body. String, regex and comment
 * contents produce no names, and `$` is an identifier character, so
 * `step$` / `$step` are found (#3536).
 *
 * A contextual keyword (`type`, `of`, `get`, …) is a legal binding name, so
 * it is reported like an identifier; a reserved word is reported only as a
 * member name (`props.default`).
 */
function scanNames(
  text: string,
  onName: (name: string) => void,
  onSubstitution?: (start: number, end: number) => void,
): void {
  // The source offset where each open template's current `${` body starts.
  const bodyStarts: number[] = []
  let prev: ts.SyntaxKind | undefined
  for (const token of iterateJsTokens(text)) {
    if (isTriviaKind(token.kind)) continue
    if (token.kind === ts.SyntaxKind.TemplateHead) {
      bodyStarts.push(token.end)
    } else if (token.kind === ts.SyntaxKind.TemplateMiddle || token.kind === ts.SyntaxKind.TemplateTail) {
      const bodyStart = bodyStarts.pop()
      // Only an outermost body: a nested template stays inside its parent's.
      if (bodyStart !== undefined && bodyStarts.length === 0) onSubstitution?.(bodyStart, token.pos)
      if (token.kind === ts.SyntaxKind.TemplateMiddle) bodyStarts.push(token.end)
    } else if (isIdentifierLikeToken(token.kind)) {
      const name = text.slice(token.pos, token.end)
      const isMemberName = prev === ts.SyntaxKind.DotToken || prev === ts.SyntaxKind.QuestionDotToken
      if (isMemberName || !RESERVED_WORDS.has(name)) onName(name)
    }
    prev = token.kind
  }
}

/** `text` as a template literal: already backtick-quoted, or quoted here. */
function asTemplateLiteral(text: string): string {
  return text.startsWith('`') && text.endsWith('`') && text.length >= 2 ? text : `\`${text}\``
}

/**
 * The AST of `text`, an expression or, when it is not one (a function body, a
 * preamble), statements. `null` when it parses as neither (JSX, a stray
 * fragment), so a caller can fall back to a token scan.
 */
function parseSource(text: string): ts.SourceFile | null {
  for (const source of [`(\n${text}\n);`, text]) {
    const sf = ts.createSourceFile('__refs__.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const diagnostics = (sf as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics
    if (!diagnostics || diagnostics.length === 0) return sf
  }
  return null
}

/**
 * Add the member names `<receiver>.name` reads, for each receiver name: a
 * props-object (or rest-bag) member is a use of that prop, which the identifier
 * alone does not say. Any other member name is no read of a binding.
 */
function addReceiverMembers(root: ts.Node, receivers: ReadonlySet<string>, set: Set<string>): void {
  if (receivers.size === 0) return
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && receivers.has(n.expression.text)) {
      set.add(n.name.text)
    }
    ts.forEachChild(n, visit)
  }
  visit(root)
}

/**
 * Add the member names the props object / rest bag (`receivers`) reads in
 * `text`. An unparsable text falls back to a token scan, which reports every
 * member name and so only keeps more alive.
 */
export function extractReceiverMembers(text: string, receivers: ReadonlySet<string>, set: Set<string>): void {
  if (receivers.size === 0) return
  const sf = parseSource(text)
  if (sf) addReceiverMembers(sf, receivers, set)
  else scanNames(text, name => { if (!isKeywordOrGlobal(name)) set.add(name) })
}

/**
 * Extract the identifiers an expression string (or a function body) reads:
 * its free identifiers from the AST (a member name, a property key and a
 * callback parameter are no reads), plus the members of `receivers` (the props
 * object and rest bag) as uses of those props. An unparsable text falls back to
 * a token scan that also reports member names, which only ever keeps more alive.
 */
export function extractIdentifiers(expr: string, set: Set<string>, receivers: ReadonlySet<string> = NO_RECEIVERS): void {
  const sf = parseSource(expr)
  if (sf) {
    for (const name of extractFreeIdentifiersFromNode(sf)) if (!isKeywordOrGlobal(name)) set.add(name)
    addReceiverMembers(sf, receivers, set)
    return
  }
  scanNames(expr, name => {
    if (!isKeywordOrGlobal(name)) set.add(name)
  })
}

const NO_RECEIVERS: ReadonlySet<string> = new Set()

/**
 * Yield each `${...}` substitution body inside a template-style string
 * (backtick-quoted or not). Returns the inner expressions — the
 * surrounding HTML / static text is stripped. Empty array when no
 * substitutions are present. Nested braces and template literals inside a
 * body are kept whole.
 */
export function extractTemplateExpressions(template: string): string[] {
  const literal = asTemplateLiteral(template)
  const out: string[] = []
  scanNames(literal, () => {}, (start, end) => out.push(literal.slice(start, end)))
  return out
}

/**
 * Extract identifiers from template literal expressions.
 * Only `${...}` substitutions are scanned; static text is not code.
 */
export function extractTemplateIdentifiers(template: string, set: Set<string>, receivers: ReadonlySet<string> = NO_RECEIVERS): void {
  extractIdentifiers(asTemplateLiteral(template), set, receivers)
}

/**
 * Check if an identifier is a JavaScript keyword or common global.
 */
export function isKeywordOrGlobal(id: string): boolean {
  return KEYWORDS_AND_GLOBALS.has(id)
}
