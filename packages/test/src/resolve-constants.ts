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
 * with union semantics. An object-literal const with string-literal,
 * template-literal, or bare-identifier-valued properties (`const rowClass
 * = { active: \`${base} row-active\`, plain: base }`) additionally seeds
 * member-path
 * keys (`rowClass.active` → `'row row-active'`) so a member-access
 * className (`className={rowClass.active}`, or a ternary arm) resolves
 * through the same lookup (#2354, template-literal values #2360).
 * Function expressions and other complex property values are skipped.
 */
export function resolveConstants(
  constants: Array<{ name: string; value?: string; valueBranches?: string[]; parsed?: ParsedExpr }>
): Map<string, string> {
  const resolved = new Map<string, string>()

  for (const c of constants) {
    // Object-literal const: expose each resolvable property as a
    // `name.key` member-path key. The object's OWN bare identifier
    // (`c.name` referenced directly, e.g. `className={rowClass}`) stays
    // unresolved — an object is not a class string — matching prior
    // behavior; this is unrelated to a resolvable identifier-valued
    // PROPERTY (`{ plain: base }`), handled by resolveObjectPropValue
    // below (Copilot review, PR #2361).
    if (c.parsed?.kind === 'object-literal') {
      for (const prop of c.parsed.properties) {
        const value = resolveObjectPropValue(prop.value, resolved)
        if (value !== null) resolved.set(`${c.name}.${prop.key}`, value)
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

/**
 * Resolve one object-literal property's value to a string, for the
 * `name.key` member-path seeding above. Supports the same shapes as
 * `tryResolve` — string literal, template literal, plain identifier
 * reference — but walks the already-structured `ParsedExpr` (available
 * here, unlike `tryResolve`'s raw-string input) instead of re-parsing
 * with a regex, and is stricter about "unresolvable": `tryResolve`'s
 * template-literal branch folds an unresolved `${...}` to `''` (its
 * caller only ever uses that for the whole-constant case, where a
 * partial string is an acceptable degrade), but a property value here
 * returns `null` for the whole property instead — seeding `name.key`
 * with a misleadingly partial class string would be worse than not
 * seeding it at all. A bare identifier property (`{ plain: base }`) and
 * an interpolated identifier inside a template literal both resolve
 * against `resolved` — safe because `resolveConstants` processes
 * `constants` in declaration order, so a module-scope const referenced
 * inside a later object literal's property is already in the map
 * (#2360). Anything else (a nested object/array, a call, a binary
 * expression, ...) is left unresolved, same posture as `tryResolve`
 * skipping "complex values".
 */
function resolveObjectPropValue(expr: ParsedExpr, resolved: Map<string, string>): string | null {
  if (expr.kind === 'literal' && expr.literalType === 'string') {
    return String(expr.value)
  }
  if (expr.kind === 'identifier') {
    return resolved.get(expr.name) ?? null
  }
  if (expr.kind === 'template-literal') {
    const strs: string[] = []
    for (const part of expr.parts) {
      if (part.type === 'string') {
        strs.push(part.value)
        continue
      }
      // An interpolation that isn't a plain identifier reference (a
      // conditional, a member access, ...), or one that IS an identifier
      // but doesn't resolve, makes the whole template unresolved — don't
      // fold it to '' and seed a partial, misleadingly "resolved" string
      // (Copilot review, PR #2361).
      if (part.expr.kind !== 'identifier') return null
      const value = resolved.get(part.expr.name)
      if (value === undefined) return null
      strs.push(value)
    }
    return strs.join('')
  }
  return null
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
