/**
 * CSS Layer Prefixer
 *
 * Prefixes component class names with UnoCSS layer variants (e.g., `layer-components:`)
 * for CSS cascade ordering. Un-layered user classes always beat layered component classes.
 */

import type { ComponentIR, IRNode, IRTemplatePart } from './types.ts'

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
  applyCssLayerPrefixToFile([ir], layerName)
}

/**
 * File-wide variant: apply the prefix across ALL of a file's component IRs
 * with ONE union of referenced constants.
 *
 * Each component's IR carries its own `ConstantInfo` copies of the file's
 * module-scope constants, and per-IR application prefixed only the copies
 * the component's own class attributes referenced. That was invisible while
 * every component re-declared the constants inside its body, but module
 * shape emission (#2570) hoists them to ONE module-scope declaration —
 * per-component divergence then emits the same constant twice with
 * different values ("tabsClasses has already been declared", tabs in the
 * site/ui build). Applying the union keeps every IR's copy byte-identical,
 * so the compiler's statement-level dedup collapses them to a single,
 * consistently-prefixed declaration.
 */
export function applyCssLayerPrefixToFile(irs: readonly ComponentIR[], layerName: string): void {
  const referencedConstants = new Set<string>()
  const constantNames = new Set<string>()
  for (const ir of irs) {
    for (const c of ir.metadata.localConstants) constantNames.add(c.name)
  }

  // Walk every IR tree and process className/class attributes, collecting
  // referenced constants into the shared union.
  for (const ir of irs) {
    collectAndPrefixAttrs(ir, layerName, referencedConstants, constantNames)
  }

  // Resolve transitive references (constants referencing other constants) —
  // against every IR's constant list, since a name may only carry a value
  // in the IRs whose lexical prefix includes it.
  let changed = true
  while (changed) {
    changed = false
    for (const constName of [...referencedConstants]) {
      for (const ir of irs) {
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
  }

  // Apply prefixing to every IR's copy of each referenced constant.
  for (const ir of irs) {
    for (const constant of ir.metadata.localConstants) {
      if (referencedConstants.has(constant.name) && constant.value) {
        constant.value = prefixConstantValue(constant.value, layerName)
      }
    }
  }
}

function collectAndPrefixAttrs(
  ir: ComponentIR,
  layerName: string,
  referencedConstants: Set<string>,
  constantNames: ReadonlySet<string>,
): void {
  // Walk IR tree and process className/class attributes
  walkIR(ir.root, (node) => {
    if (node.type !== 'element') return

    for (const attr of node.attrs) {
      if (attr.name !== 'class' && attr.name !== 'className') continue

      switch (attr.value.kind) {
        case 'literal':
          attr.value.value = prefixClassString(attr.value.value, layerName)
          break
        case 'template': {
          prefixIRTemplateParts(attr.value.parts, layerName)
          // Extract constant references from ${expr} in string parts
          for (const part of attr.value.parts) {
            if (part.type === 'string' && part.value.includes('${')) {
              collectConstantRefs(part.value, referencedConstants, constantNames)
            }
          }
          break
        }
        case 'expression':
          collectConstantRefs(attr.value.expr, referencedConstants, constantNames)
          break
        case 'spread':
          collectConstantRefs(attr.value.expr, referencedConstants, constantNames)
          break
        case 'boolean-attr':
        case 'boolean-shorthand':
        case 'jsx-children':
          break
      }
    }
  })

}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Prefix ternary parts and pure static text in a structured `template`
 * AttrValue's parts.
 */
function prefixIRTemplateParts(parts: IRTemplatePart[], layerName: string): void {
  for (const part of parts) {
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
  validNames: ReadonlySet<string>,
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
