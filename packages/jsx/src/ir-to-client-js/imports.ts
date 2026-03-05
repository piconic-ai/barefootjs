/**
 * Import detection and DOM import management.
 */

import type { ComponentIR, IRNode } from '../types'

// All exports from @barefootjs/dom that may be used in generated code
export const DOM_IMPORT_CANDIDATES = [
  'createSignal', 'createMemo', 'createEffect', 'onCleanup', 'onMount',
  'hydrate', 'insert', 'reconcileElements', 'reconcileTemplates',
  'createComponent', 'renderChild', 'registerComponent', 'registerTemplate', 'initChild', 'updateClientMarker',
  'createPortal',
  'provideContext', 'createContext', 'useContext',
  'forwardProps', 'applyRestAttrs', 'splitProps', 'spreadAttrs',
  '__slot',
] as const

export const IMPORT_PLACEHOLDER = '/* __BAREFOOTJS_DOM_IMPORTS__ */'
export const MODULE_CONSTANTS_PLACEHOLDER = '/* __MODULE_LEVEL_CONSTANTS__ */'

/**
 * Detect which @barefootjs/dom functions are actually used in the generated code
 */
export function detectUsedImports(code: string): Set<string> {
  const used = new Set<string>()
  for (const name of DOM_IMPORT_CANDIDATES) {
    // Match function calls: name(
    if (new RegExp(`\\b${name}\\s*\\(`).test(code)) {
      used.add(name)
    }
  }
  // Shorthand finders need special detection ($ is not a word character)
  if (/\$c\s*\(/.test(code)) {
    used.add('$c')
  }
  // Match $t( for text node finders
  if (/\$t\s*\(/.test(code)) {
    used.add('$t')
  }
  // Match $( but not $c( or $t( - use negative lookahead
  if (/\$\s*\(/.test(code)) {
    used.add('$')
  }
  return used
}

/**
 * Collect user-defined imports from @barefootjs/dom (preserve PR #248 behavior)
 */
export function collectUserDomImports(ir: ComponentIR): string[] {
  const userImports: string[] = []
  for (const imp of ir.metadata.imports) {
    if (imp.source === '@barefootjs/dom' && !imp.isTypeOnly) {
      for (const spec of imp.specifiers) {
        if (!spec.isDefault && !spec.isNamespace) {
          userImports.push(spec.alias ? `${spec.name} as ${spec.alias}` : spec.name)
        }
      }
    }
  }
  return userImports
}

/**
 * Collect external (non-DOM, non-component) imports that are used in generated code.
 * These are third-party libraries like @barefootjs/form, zod, etc. that need to be
 * preserved in client JS output so the browser can resolve them via import map.
 */
export function collectExternalImports(ir: ComponentIR, generatedCode: string, localImportPrefixes?: string[]): string[] {
  const componentNames = collectComponentNames(ir.root)
  const importLines: string[] = []
  for (const imp of ir.metadata.imports) {
    if (imp.isTypeOnly) continue
    if (imp.source === '@barefootjs/dom') continue
    // Skip local path-alias imports (resolved at build time, not in browser)
    if (localImportPrefixes?.some(prefix => imp.source.startsWith(prefix))) continue

    // Check which specifiers are actually used in the generated code.
    // Skip component names — they are rendered via initChild(), not imported directly.
    const usedSpecs: string[] = []
    for (const spec of imp.specifiers) {
      const localName = spec.alias || spec.name
      if (componentNames.has(localName)) continue
      if (new RegExp(`\\b${localName}\\b`).test(generatedCode)) {
        usedSpecs.push(spec.alias ? `${spec.name} as ${spec.alias}` : spec.name)
      }
    }

    if (usedSpecs.length > 0) {
      importLines.push(`import { ${usedSpecs.join(', ')} } from '${imp.source}'`)
    }
  }
  return importLines
}

/** Collect all component names referenced in the IR tree. */
function collectComponentNames(node: IRNode): Set<string> {
  const names = new Set<string>()
  function walk(n: IRNode): void {
    if (n.type === 'component') {
      names.add(n.name)
    }
    if ('children' in n && Array.isArray(n.children)) {
      for (const child of n.children) walk(child)
    }
    if (n.type === 'conditional') {
      walk(n.whenTrue)
      walk(n.whenFalse)
    }
    if (n.type === 'if-statement') {
      walk(n.consequent)
      if (n.alternate) walk(n.alternate)
    }
  }
  walk(node)
  return names
}
