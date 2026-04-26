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
 * Extract identifiers from an expression string.
 */
export function extractIdentifiers(expr: string, set: Set<string>): void {
  const matches = expr.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g)
  if (matches) {
    for (const id of matches) {
      if (!isKeywordOrGlobal(id)) {
        set.add(id)
      }
    }
  }
}

/**
 * Yield each `${...}` substitution body inside a template-style string.
 * Returns the inner expressions — the surrounding HTML / static text is
 * stripped. Empty array when no substitutions are present.
 *
 * Uses a `[^}]+` character class rather than a balance-aware scanner —
 * cheap and matches the legacy reach. Object literals inside `${...}`
 * are not supported (they would split prematurely on the inner `}`).
 */
export function extractTemplateExpressions(template: string): string[] {
  const re = /\$\{([^}]+)\}/g
  const out: string[] = []
  let match
  while ((match = re.exec(template)) !== null) {
    out.push(match[1])
  }
  return out
}

/**
 * Extract identifiers from template literal expressions.
 * Finds ${...} patterns and extracts identifiers from inside.
 */
export function extractTemplateIdentifiers(template: string, set: Set<string>): void {
  for (const expr of extractTemplateExpressions(template)) {
    extractIdentifiers(expr, set)
  }
}

/**
 * Check if an identifier is a JavaScript keyword or common global.
 */
export function isKeywordOrGlobal(id: string): boolean {
  return KEYWORDS_AND_GLOBALS.has(id)
}
