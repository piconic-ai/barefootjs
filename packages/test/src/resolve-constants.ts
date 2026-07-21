/**
 * Constant resolution for test IR.
 *
 * Resolves string-valued constants (string literals, template literals,
 * array.join() patterns, and identifier references) into their actual
 * string values. When the analyzer provides structured `valueBranches`
 * (from ternary initializers), those are used directly instead of
 * re-parsing from the string representation.
 */

import type { ParsedExpr } from '@barefootjs/jsx'

/**
 * Build a map of constant name → resolved string value.
 * Resolves string literals, template literals, array.join() patterns,
 * and plain identifier references. When `valueBranches` is present
 * (from ternary initializers), each branch is resolved and merged
 * with union semantics. An object-literal const with string-valued
 * properties (`const rowClass = { active: 'row row-active', plain: 'row' }`)
 * additionally seeds member-path keys (`rowClass.active` → `'row row-active'`)
 * so a member-access className (`className={rowClass.active}`, or a
 * ternary arm) resolves through the same lookup (#2354). Function
 * expressions and other complex values are skipped.
 */
export function resolveConstants(
  constants: Array<{ name: string; value?: string; valueBranches?: string[]; parsed?: ParsedExpr }>
): Map<string, string> {
  const resolved = new Map<string, string>()

  for (const c of constants) {
    // Object-literal const: expose each string-valued property as a
    // `name.key` member-path key. The bare identifier stays unresolved
    // (an object is not a class string), matching prior behavior.
    if (c.parsed?.kind === 'object-literal') {
      for (const prop of c.parsed.properties) {
        if (prop.value.kind === 'literal' && prop.value.literalType === 'string') {
          resolved.set(`${c.name}.${prop.key}`, String(prop.value.value))
        }
      }
      continue
    }

    if (!c.value) continue

    // When the analyzer provides structured branch info, resolve each
    // branch and merge unique class tokens (union semantics).
    if (c.valueBranches) {
      const tokens = new Set<string>()
      for (const branch of c.valueBranches) {
        const v = tryResolve(branch, resolved)
        if (v) for (const t of v.split(/\s+/)) if (t) tokens.add(t)
      }
      if (tokens.size > 0) {
        resolved.set(c.name, [...tokens].join(' '))
      }
      continue
    }

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

  // Plain identifier reference: look up a previously resolved constant
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value) && resolved.has(value)) {
    return resolved.get(value)!
  }

  return null
}
