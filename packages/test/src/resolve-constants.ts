/**
 * Constant resolution for test IR.
 *
 * Resolves string-valued constants (string literals, template literals,
 * array.join() patterns, ternary expressions, and identifier references)
 * into their actual string values. This enables className assertions on
 * resolved CSS class names instead of variable names.
 */

/**
 * Build a map of constant name → resolved string value.
 * Resolves string literals, template literals, array.join() patterns,
 * ternary expressions (union of both branches), and plain identifier
 * references. Record lookups, function expressions, and other complex
 * values are skipped.
 */
export function resolveConstants(constants: Array<{ name: string; value?: string }>): Map<string, string> {
  const resolved = new Map<string, string>()

  for (const c of constants) {
    if (!c.value) continue
    const value = tryResolve(c.value, resolved)
    if (value !== null) {
      resolved.set(c.name, value)
    }
  }

  return resolved
}

function tryResolve(raw: string, resolved: Map<string, string>): string | null {
  const value = raw.trim()

  // Single-quoted string literal: 'content'
  if (value.startsWith("'") && value.endsWith("'") && !value.slice(1, -1).includes("'")) {
    return value.slice(1, -1)
  }

  // Double-quoted string literal: "content"
  if (value.startsWith('"') && value.endsWith('"') && !value.slice(1, -1).includes('"')) {
    return value.slice(1, -1)
  }

  // Template literal: `...${var}...`
  if (value.startsWith('`') && value.endsWith('`')) {
    const inner = value.slice(1, -1)
    return inner.replace(/\$\{([^}]+)\}/g, (_, expr) => {
      const trimmed = expr.trim()
      return resolved.get(trimmed) ?? ''
    })
  }

  // Array.join() pattern: [...].join(' ')
  const joinMatch = value.match(/^\[([\s\S]*)\]\.join\(\s*(['"])([^'"]*)\2\s*\)$/)
  if (joinMatch) {
    const arrayContent = joinMatch[1]
    const separator = joinMatch[3]
    const strings: string[] = []
    const stringPattern = /(?:'([^']*)'|"([^"]*)")/g
    let m: RegExpExecArray | null
    while ((m = stringPattern.exec(arrayContent)) !== null) {
      strings.push(m[1] ?? m[2])
    }
    return strings.join(separator)
  }

  // Ternary expression: condition ? trueExpr : falseExpr
  // Resolve both branches and merge unique class tokens (union semantics).
  const ternary = parseTernary(value)
  if (ternary) {
    const trueVal = tryResolve(ternary.trueBranch, resolved)
    const falseVal = tryResolve(ternary.falseBranch, resolved)
    if (trueVal !== null || falseVal !== null) {
      const tokens = new Set<string>()
      for (const v of [trueVal, falseVal]) {
        if (v) for (const t of v.split(/\s+/)) if (t) tokens.add(t)
      }
      return [...tokens].join(' ')
    }
  }

  // Plain identifier reference: look up a previously resolved constant
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value) && resolved.has(value)) {
    return resolved.get(value)!
  }

  return null
}

// ---------------------------------------------------------------------------
// Ternary expression parser
// ---------------------------------------------------------------------------

/**
 * Check if the character at `pos` is escaped by a preceding backslash.
 */
function isEscaped(s: string, pos: number): boolean {
  let backslashes = 0
  for (let i = pos - 1; i >= 0 && s[i] === '\\'; i--) backslashes++
  return backslashes % 2 === 1
}

/**
 * Parse a ternary expression `condition ? trueBranch : falseBranch`.
 *
 * Uses a bracket/string-aware scanner to find the top-level `?` and `:`
 * while skipping:
 * - Nested brackets: `()`, `[]`, `{}`
 * - String literals: `'...'`, `"..."`, `` `...` ``
 * - Optional chaining: `?.`
 * - Nullish coalescing: `??`
 */
function parseTernary(value: string): { trueBranch: string; falseBranch: string } | null {
  let depth = 0
  let questionPos = -1

  for (let i = 0; i < value.length; i++) {
    const ch = value[i]

    // Skip string/template literals
    if ((ch === "'" || ch === '"' || ch === '`') && !isEscaped(value, i)) {
      const quote = ch
      i++
      while (i < value.length) {
        if (value[i] === '\\') { i++; i++; continue }
        if (value[i] === quote) break
        // Template literal interpolation — skip ${...}
        if (quote === '`' && value[i] === '$' && value[i + 1] === '{') {
          let braceDepth = 1
          i += 2
          while (i < value.length && braceDepth > 0) {
            if (value[i] === '{') braceDepth++
            else if (value[i] === '}') braceDepth--
            i++
          }
          continue
        }
        i++
      }
      continue
    }

    // Track bracket depth
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; continue }

    // Only match at top level (depth === 0)
    if (depth !== 0) continue

    if (ch === '?') {
      // Skip optional chaining `?.` and nullish coalescing `??`
      if (value[i + 1] === '.' || value[i + 1] === '?') continue
      questionPos = i
    }

    if (ch === ':' && questionPos >= 0) {
      const trueBranch = value.slice(questionPos + 1, i).trim()
      const falseBranch = value.slice(i + 1).trim()
      if (trueBranch && falseBranch) {
        return { trueBranch, falseBranch }
      }
    }
  }

  return null
}
