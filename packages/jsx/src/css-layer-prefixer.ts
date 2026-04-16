/**
 * CSS Layer Prefixer
 *
 * Prefixes component class names with UnoCSS layer variants (e.g., `layer-components:`)
 * for CSS cascade ordering. Un-layered user classes always beat layered component classes.
 */

import type { ComponentIR, IRNode, IRTemplateLiteral } from './types'

/**
 * Prefix a single CSS class token with a layer variant.
 * 'bg-primary' → 'layer-components:bg-primary'
 * 'hover:bg-primary/90' → 'layer-components:hover:bg-primary/90'
 * Already-prefixed or empty → unchanged.
 */
export function prefixClass(cls: string, layerName: string): string {
  if (!cls || cls.startsWith('layer-')) return cls
  return `layer-${layerName}:${cls}`
}

/**
 * Prefix all class tokens in a whitespace-separated class string.
 */
export function prefixClassString(str: string, layerName: string): string {
  if (!str.trim()) return str
  return str.replace(/\S+/g, token => prefixClass(token, layerName))
}

/**
 * Transform a ConstantInfo.value (raw JS source text) by prefixing
 * class tokens within string literals.
 *
 * - String literal: 'bg-primary text-white' → 'layer-X:bg-primary layer-X:text-white'
 * - Object literal: { default: 'bg-primary', ... } → prefix each string value
 * - Array: ['cls1', 'cls2'] → prefix each string element
 * - Other: return unchanged
 */
export function prefixConstantValue(rawValue: string, layerName: string): string {
  const trimmed = rawValue.trim()

  // String literal: '...' or "..."
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    const quote = trimmed[0]
    const content = trimmed.slice(1, -1)
    const prefixed = prefixClassString(content, layerName)
    return `${quote}${prefixed}${quote}`
  }

  // Object literal: { key: 'value', ... }
  // Prefix string values that appear after ':'
  if (trimmed.startsWith('{')) {
    return trimmed
      .replace(/:\s*'((?:\\'|[^'])*)'/g, (_, content) => {
        return `: '${prefixClassString(content, layerName)}'`
      })
      .replace(/:\s*"((?:\\"|[^"])*)"/g, (_, content) => {
        return `: "${prefixClassString(content, layerName)}"`
      })
  }

  // Array: ['cls1', 'cls2']
  if (trimmed.startsWith('[')) {
    return trimmed
      .replace(/'((?:\\'|[^'])*)'/g, (_, content) => {
        return `'${prefixClassString(content, layerName)}'`
      })
      .replace(/"((?:\\"|[^"])*)"/g, (_, content) => {
        return `"${prefixClassString(content, layerName)}"`
      })
  }

  return rawValue
}

/**
 * Apply CSS layer prefix to a ComponentIR.
 * Prefixes static class attributes and class-related constant values.
 */
export function applyCssLayerPrefix(ir: ComponentIR, layerName: string): void {
  const referencedConstants = new Set<string>()
  const constantNames = new Set(ir.metadata.localConstants.map(c => c.name))

  // Walk IR tree and process className/class attributes
  walkIR(ir.root, (node) => {
    if (node.type !== 'element') return

    for (const attr of node.attrs) {
      if (attr.name !== 'class' && attr.name !== 'className') continue
      if (attr.value === null) continue

      // Static className: prefix value directly
      if (typeof attr.value === 'string' && attr.isLiteral) {
        attr.value = prefixClassString(attr.value, layerName)
        continue
      }

      // IRTemplateLiteral: prefix ternary branches and static string parts
      if (typeof attr.value === 'object' && attr.value.type === 'template-literal') {
        prefixIRTemplateLiteral(attr.value, layerName)
        // Extract constant references from ${expr} in string parts
        for (const part of attr.value.parts) {
          if (part.type === 'string' && part.value.includes('${')) {
            collectConstantRefs(part.value, referencedConstants, constantNames)
          }
        }
        continue
      }

      // Dynamic expression: extract referenced constants
      if (typeof attr.value === 'string' && !attr.isLiteral) {
        collectConstantRefs(attr.value, referencedConstants, constantNames)
      }
    }
  })

  // Resolve transitive references (constants referencing other constants)
  let changed = true
  while (changed) {
    changed = false
    for (const constName of [...referencedConstants]) {
      const constant = ir.metadata.localConstants.find(c => c.name === constName)
      if (!constant || !constant.value) continue
      for (const id of extractIdentifiers(constant.value)) {
        if (constantNames.has(id) && !referencedConstants.has(id)) {
          referencedConstants.add(id)
          changed = true
        }
      }
    }
  }

  // Apply prefixing to referenced constants
  for (const constant of ir.metadata.localConstants) {
    if (referencedConstants.has(constant.name) && constant.value) {
      constant.value = prefixConstantValue(constant.value, layerName)
    }
  }
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Prefix ternary parts and pure static text in an IRTemplateLiteral.
 */
function prefixIRTemplateLiteral(tl: IRTemplateLiteral, layerName: string): void {
  for (const part of tl.parts) {
    if (part.type === 'ternary') {
      part.whenTrue = prefixClassString(part.whenTrue, layerName)
      part.whenFalse = prefixClassString(part.whenFalse, layerName)
    } else if (part.type === 'string' && !part.value.includes('${')) {
      // Only prefix pure static text (no ${expr} references)
      part.value = prefixClassString(part.value, layerName)
    }
  }
}

/**
 * Add identifiers from an expression that exist in the constant names set.
 */
function collectConstantRefs(
  expr: string,
  refs: Set<string>,
  validNames: Set<string>,
): void {
  for (const id of extractIdentifiers(expr)) {
    if (validNames.has(id)) {
      refs.add(id)
    }
  }
}

/**
 * Extract standalone identifiers from a JS expression string.
 * Skips property access (identifiers after '.') and string literal contents.
 */
export function extractIdentifiers(expr: string): string[] {
  // Strip single/double quoted string literals to avoid false matches
  const stripped = expr
    .replace(/'(?:\\'|[^'])*'/g, '""')
    .replace(/"(?:\\"|[^"])*"/g, '""')

  const identifiers: string[] = []
  const re = /(?<![.])\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g
  let match
  while ((match = re.exec(stripped)) !== null) {
    identifiers.push(match[1])
  }
  return identifiers
}

/**
 * Walk all nodes in the IR tree, calling visitor for each node.
 */
function walkIR(node: IRNode, visitor: (node: IRNode) => void): void {
  visitor(node)

  switch (node.type) {
    case 'element':
      for (const child of node.children) walkIR(child, visitor)
      break
    case 'conditional':
      walkIR(node.whenTrue, visitor)
      walkIR(node.whenFalse, visitor)
      break
    case 'loop':
      for (const child of node.children) walkIR(child, visitor)
      break
    case 'component':
      for (const child of node.children) walkIR(child, visitor)
      break
    case 'fragment':
      for (const child of node.children) walkIR(child, visitor)
      break
    case 'if-statement':
      walkIR(node.consequent, visitor)
      if (node.alternate) walkIR(node.alternate, visitor)
      break
    case 'provider':
    case 'async':
      for (const child of node.children) walkIR(child, visitor)
      break
  }
}
