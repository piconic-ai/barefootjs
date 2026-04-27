/**
 * BarefootJS Compiler - Module Exports Generation
 *
 * Generates module-level export statements from ComponentIR.
 * This is a compiler-layer concern, not adapter-specific.
 */

import type { ComponentIR, ParamInfo } from './types'

/**
 * Emit module-level exports for local declarations and `export { ... } [from '...']`
 * specifier blocks. Specifiers whose local name appears in `extraInlineExported`
 * (already emitted inline) are filtered, except for `from`-form re-exports and
 * aliased forms that introduce a new external name.
 */
export function generateModuleExports(
  ir: ComponentIR,
  extraInlineExported: ReadonlySet<string> = new Set()
): string | null {
  const lines: string[] = []

  for (const constant of ir.metadata.localConstants) {
    if (!constant.isExported) continue
    const keyword = constant.declarationKind ?? 'const'
    if (!constant.value) {
      lines.push(`export ${keyword} ${constant.name}`)
      continue
    }
    const value = constant.value.trim()
    // Skip client-only constructs
    if (/^createContext\b/.test(value) || /^new WeakMap\b/.test(value)) continue

    lines.push(`export ${keyword} ${constant.name} = ${constant.value}`)
  }

  for (const func of ir.metadata.localFunctions) {
    if (!func.isExported) continue
    const params = func.params.map(formatParamWithType).join(', ')
    lines.push(`export function ${func.name}(${params}) ${func.body}`)
  }

  const inlineExported = collectInlineExportedNames(ir)
  for (const name of extraInlineExported) inlineExported.add(name)

  for (const block of ir.metadata.namedExports) {
    const isReexportFrom = block.source !== null

    const survivingSpecs = block.specifiers.filter((spec) => {
      if (isReexportFrom) return true
      // `export { X as Y }` with inline `export const X` is not a duplicate
      // (Y is a new external name), so only drop when alias is absent.
      return !(inlineExported.has(spec.name) && spec.alias == null)
    })

    if (survivingSpecs.length === 0) continue

    const specText = survivingSpecs
      .map((s) => {
        const prefix = s.isTypeOnly ? 'type ' : ''
        return s.alias ? `${prefix}${s.name} as ${s.alias}` : `${prefix}${s.name}`
      })
      .join(', ')
    const typeKw = block.isTypeOnly ? 'type ' : ''
    if (isReexportFrom) {
      lines.push(`export ${typeKw}{ ${specText} } from '${block.source}'`)
    } else {
      lines.push(`export ${typeKw}{ ${specText} }`)
    }
  }

  return lines.length > 0 ? lines.join('\n') : null
}

export function collectInlineExportedNames(ir: ComponentIR): Set<string> {
  const names = new Set<string>()
  for (const c of ir.metadata.localConstants) {
    if (c.isExported) names.add(c.name)
  }
  for (const f of ir.metadata.localFunctions) {
    if (f.isExported) names.add(f.name)
  }
  // Component itself is inline-exported by applyExportKeyword.
  if (ir.metadata.isExported && ir.metadata.componentName) {
    names.add(ir.metadata.componentName)
  }
  return names
}

/**
 * Format a ParamInfo for .tsx output, preserving type annotations when available.
 */
export function formatParamWithType(p: ParamInfo): string {
  const typeAnnotation = p.type?.raw && p.type.raw !== 'unknown' ? `: ${p.type.raw}` : ''
  return `${p.name}${typeAnnotation}`
}

/**
 * Find names reachable from primary reference text via transitive dependency analysis.
 * Used to determine which SSR declarations are actually needed (vs. only used in event handlers).
 */
export function findReachableNames(
  primaryRefs: string,
  declarations: { name: string; body: string }[],
): Set<string> {
  const allNames = new Set(declarations.map(d => d.name))
  const bodyMap = new Map(declarations.map(d => [d.name, d.body]))
  const reachable = new Set<string>()
  const queue: string[] = []

  for (const name of allNames) {
    if (new RegExp(`\\b${name}\\b`).test(primaryRefs)) {
      reachable.add(name)
      queue.push(name)
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    const body = bodyMap.get(current) || ''
    for (const name of allNames) {
      if (!reachable.has(name) && new RegExp(`\\b${name}\\b`).test(body)) {
        reachable.add(name)
        queue.push(name)
      }
    }
  }

  return reachable
}

/**
 * Extract parameter names from a function expression string.
 * Handles: arrow functions, single-param arrows, function expressions.
 * Strips type annotations and default values.
 */
export function extractFunctionParams(value: string): string {
  // Match arrow function parameters: (a, b) => ... or async (a, b) => ...
  const arrowMatch = value.match(/^(?:async\s*)?\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>/)
  if (arrowMatch) {
    return arrowMatch[1]
      .split(',')
      .map((p) => p.trim().split(':')[0].split('=')[0].trim())
      .filter(Boolean)
      .join(', ')
  }
  // Single param arrow function: a => ...
  const singleMatch = value.match(/^(?:async\s*)?(\w+)\s*=>/)
  if (singleMatch) {
    return singleMatch[1]
  }
  // Function expression: function(a, b) { ... }
  const funcMatch = value.match(/^(?:async\s*)?function\s*\w*\s*\(([^)]*)\)/)
  if (funcMatch) {
    return funcMatch[1]
      .split(',')
      .map((p) => p.trim().split(':')[0].split('=')[0].trim())
      .filter(Boolean)
      .join(', ')
  }
  return ''
}
