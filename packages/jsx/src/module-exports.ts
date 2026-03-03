/**
 * BarefootJS Compiler - Module Exports Generation
 *
 * Generates module-level export statements from ComponentIR.
 * This is a compiler-layer concern, not adapter-specific.
 */

import type { ComponentIR } from './types'

/**
 * Generate module-level export statements for constants and functions.
 * Skips client-only constructs (createContext, new WeakMap).
 */
export function generateModuleExports(ir: ComponentIR): string | null {
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
    const params = func.params.map((p) => p.name).join(', ')
    lines.push(`export function ${func.name}(${params}) ${func.body}`)
  }

  return lines.length > 0 ? lines.join('\n') : null
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
