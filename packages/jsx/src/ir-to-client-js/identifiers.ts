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
 * Walk the tokens of `text` with TypeScript's scanner, calling `onName` for
 * every identifier, member names included (`props.value` yields both: the
 * reference graph reads a props-object member as a use of that prop), and
 * `onSubstitution` with the source span of every outermost `${…}` body. String
 * contents and comments produce no tokens, and `$` is an identifier
 * character, so `step$` / `$step` are found (#3536).
 *
 * A contextual keyword (`type`, `of`, `get`, …) is a legal binding name, so
 * it is reported like an identifier; a reserved word never is.
 */
function scanNames(
  text: string,
  onName: (name: string) => void,
  onSubstitution?: (start: number, end: number) => void,
): void {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, /*skipTrivia*/ true, ts.LanguageVariant.Standard, text)
  // One entry per open brace: the source offset where a `${` body starts,
  // or -1 for an ordinary `{`.
  const braces: number[] = []
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.TemplateHead) {
      braces.push(scanner.getTokenEnd())
    } else if (token === ts.SyntaxKind.OpenBraceToken) {
      braces.push(-1)
    } else if (token === ts.SyntaxKind.CloseBraceToken) {
      const bodyStart = braces.pop() ?? -1
      if (bodyStart >= 0) {
        // Only an outermost body: a nested template stays inside its parent's.
        if (!braces.some(start => start >= 0)) onSubstitution?.(bodyStart, scanner.getTokenStart())
        token = scanner.reScanTemplateToken(/*isTaggedTemplate*/ false)
        if (token === ts.SyntaxKind.TemplateMiddle) braces.push(scanner.getTokenEnd())
      }
    } else if (
      (token === ts.SyntaxKind.Identifier ||
        (token >= ts.SyntaxKind.FirstKeyword && token <= ts.SyntaxKind.LastKeyword)) &&
      !RESERVED_WORDS.has(scanner.getTokenValue())
    ) {
      onName(scanner.getTokenValue())
    }
  }
}

/** `text` as a template literal: already backtick-quoted, or quoted here. */
function asTemplateLiteral(text: string): string {
  return text.startsWith('`') && text.endsWith('`') && text.length >= 2 ? text : `\`${text}\``
}

/**
 * Extract identifiers from an expression string.
 */
export function extractIdentifiers(expr: string, set: Set<string>): void {
  scanNames(expr, name => {
    if (!isKeywordOrGlobal(name)) set.add(name)
  })
}

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
export function extractTemplateIdentifiers(template: string, set: Set<string>): void {
  scanNames(asTemplateLiteral(template), name => {
    if (!isKeywordOrGlobal(name)) set.add(name)
  })
}

/**
 * Check if an identifier is a JavaScript keyword or common global.
 */
export function isKeywordOrGlobal(id: string): boolean {
  return KEYWORDS_AND_GLOBALS.has(id)
}
