// Generate preview code from component metadata.

import type { ComponentMeta, PropMeta } from './types'

export interface PreviewGenerateResult {
  code: string
  previewNames: string[]
  filePath: string
}

function toPascalCase(kebab: string): string {
  return kebab.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('')
}

function toKebabCase(pascal: string): string {
  return pascal
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Find the prop name that matches a variant type name.
 * e.g. ButtonVariant → variant, ButtonSize → size
 */
function inferVariantPropName(typeName: string, props: PropMeta[]): string | null {
  const match = props.find(p => p.type === typeName)
  return match ? match.name : null
}

/**
 * Find PascalCase JSX tags that are not in the known component set.
 */
function findExternalTags(code: string, knownNames: Set<string>): string[] {
  const external: string[] = []
  for (const m of code.matchAll(/<([A-Z][a-zA-Z0-9]*)/g)) {
    if (!knownNames.has(m[1]) && !external.includes(m[1])) {
      external.push(m[1])
    }
  }
  return external
}

/**
 * Resolve the import path for an external tag.
 * Icon components (e.g. SearchIcon) → '../icon'.
 * Tags starting with the parent component's PascalCase name → same module.
 * Others → kebab-cased relative path.
 */
function resolveExternalTagImport(
  tag: string,
  parentModuleName: string,
  parentPascalName: string,
): { from: string; name: string } {
  if (tag.endsWith('Icon')) {
    return { from: '../icon', name: tag }
  }
  if (tag.startsWith(parentPascalName)) {
    return { from: `../${parentModuleName}`, name: tag }
  }
  return { from: `../${toKebabCase(tag)}`, name: tag }
}

/**
 * Emit a JSX return block, wrapping in Fragment if there are multiple root elements.
 */
function emitJsxReturn(lines: string[], jsx: string, indent: string = '  '): void {
  const jsxLines = jsx.split('\n')
  // Count root-level elements by finding the minimum indentation
  const tagLines = jsxLines.filter(l => /^\s*<[A-Za-z]/.test(l))
  if (tagLines.length === 0) {
    lines.push(`${indent}return ${jsx}`)
    return
  }
  const minIndent = Math.min(...tagLines.map(l => l.match(/^(\s*)/)?.[1].length ?? 0))
  const rootElements = tagLines.filter(l => (l.match(/^(\s*)/)?.[1].length ?? 0) === minIndent)
  const needsFragment = rootElements.length > 1 && !jsx.trim().startsWith('<>')

  if (jsxLines.length === 1 && !needsFragment) {
    // Single line may still have multiple root elements: <A /><B />
    // Use negative lookbehind to exclude closing tags (</Foo>)
    const singleLineRoots = (jsx.match(/<(?![/])[A-Za-z]/g) ?? []).length
    if (singleLineRoots > 1) {
      lines.push(`${indent}return (<>${jsx}</>)`)
    } else {
      lines.push(`${indent}return ${jsx}`)
    }
  } else {
    lines.push(`${indent}return (`)
    if (needsFragment) lines.push(`${indent}  <>`)
    for (const l of jsxLines) {
      lines.push(`${indent}  ${needsFragment ? '  ' : ''}${l}`)
    }
    if (needsFragment) lines.push(`${indent}  </>`)
    lines.push(`${indent})`)
  }
}

/**
 * Split example code into statement lines (before JSX) and JSX body.
 */
function splitExampleCode(code: string): { statements: string[]; jsx: string } {
  const lines = code.split('\n')
  const firstJsxLine = lines.findIndex(l => l.trim().startsWith('<'))
  if (firstJsxLine <= 0) {
    return { statements: [], jsx: code }
  }
  return {
    statements: lines.slice(0, firstJsxLine).filter(l => l.trim() !== ''),
    jsx: lines.slice(firstJsxLine).join('\n'),
  }
}

/**
 * Check if an example code snippet is simple JSX (no signal usage).
 */
function isSimpleJsx(code: string): boolean {
  const trimmed = code.trim()
  return trimmed.startsWith('<') && !trimmed.includes('createSignal')
}

/**
 * Generate preview code from component metadata.
 * @param meta - Component metadata loaded from `meta/<name>.json`.
 * @param componentsBasePath - Directory the preview file is placed under,
 *   relative to the project root. Monorepo default mirrors the registry
 *   layout (`ui/components/ui`); scaffolded apps pass
 *   `barefoot.config.ts`'s `paths.components` (typically `components/ui`)
 *   so the preview lands next to the component, not in `node_modules`.
 */
export function generatePreview(
  meta: ComponentMeta,
  componentsBasePath: string = 'ui/components/ui',
): PreviewGenerateResult {
  const pascalName = toPascalCase(meta.name)
  const hasVariants = meta.variants != null && Object.keys(meta.variants).length > 0
  const hasSubComponents = meta.subComponents != null && meta.subComponents.length > 0

  // Determine if preview needs "use client" directive
  let needsClient = meta.stateful || meta.tags.includes('stateful')

  // Multi-component examples may use createSignal even if root component is not stateful
  const exampleCode = hasSubComponents && meta.examples.length > 0 ? meta.examples[0].code : ''
  if (exampleCode.includes('createSignal')) {
    needsClient = true
  }

  // Only import createSignal if generated code actually calls it
  const needsCreateSignalImport = exampleCode.includes('createSignal')

  const lines: string[] = []
  const previewNames: string[] = []

  // Header comment
  lines.push('// Auto-generated preview. Customize by editing this file.')

  // "use client" directive
  if (needsClient) {
    lines.push('"use client"')
  }
  lines.push('')

  // Imports
  if (needsCreateSignalImport) {
    lines.push("import { createSignal } from '@barefootjs/client'")
  }

  const subNames: string[] = []
  if (hasSubComponents) {
    for (const sub of meta.subComponents!) {
      subNames.push(sub.name)
    }
  }

  // Build import map: group names by source module.
  // Start with known component + sub-component names from this module.
  const importsBySource = new Map<string, string[]>()
  const moduleNames = [pascalName, ...subNames]

  if (hasSubComponents && exampleCode) {
    // For multi-component, derive imports from tags actually used in the example
    const allTags = [...exampleCode.matchAll(/<([A-Z][a-zA-Z0-9]*)/g)].map(m => m[1])
    const usedFromModule = [...new Set(allTags.filter(t => moduleNames.includes(t)))]
    if (usedFromModule.length > 0) {
      importsBySource.set(`../${meta.name}`, usedFromModule)
    }
    // External tags not in the module
    const knownNames = new Set(moduleNames)
    for (const tag of findExternalTags(exampleCode, knownNames)) {
      const resolved = resolveExternalTagImport(tag, meta.name, pascalName)
      // May resolve to the same module (e.g. TypographyH1 → ../typography)
      const list = importsBySource.get(resolved.from) ?? []
      if (!list.includes(resolved.name)) list.push(resolved.name)
      importsBySource.set(resolved.from, list)
    }
  } else {
    // Non-multi-component or no examples: import root + sub-components
    importsBySource.set(`../${meta.name}`, moduleNames)
  }

  for (const [from, names] of importsBySource) {
    lines.push(`import { ${names.join(', ')} } from '${from}'`)
  }

  lines.push('')

  // Generate preview functions based on component type
  if (hasSubComponents) {
    generateMultiComponent(lines, previewNames, meta, pascalName, subNames)
  } else if (needsClient && hasVariants) {
    generateStatefulWithVariants(lines, previewNames, meta, pascalName)
  } else if (needsClient) {
    generateStateful(lines, previewNames, meta, pascalName)
  } else if (hasVariants) {
    generateStatelessWithVariants(lines, previewNames, meta, pascalName)
  } else {
    generateStatelessSimple(lines, previewNames, meta, pascalName)
  }

  lines.push('')

  return {
    code: lines.join('\n'),
    previewNames,
    filePath: `${componentsBasePath}/${meta.name}/index.preview.tsx`,
  }
}

// --- Strategy: Stateless + Variants (button, badge) ---

function generateStatelessWithVariants(
  lines: string[],
  previewNames: string[],
  meta: ComponentMeta,
  pascalName: string,
): void {
  // Default preview
  previewNames.push('Default')
  lines.push('export function Default() {')
  lines.push(`  return <${pascalName}>${meta.title}</${pascalName}>`)
  lines.push('}')
  lines.push('')

  // One preview function per variant type
  for (const [typeName, values] of Object.entries(meta.variants!)) {
    const propName = inferVariantPropName(typeName, meta.props)
    if (!propName) continue

    const funcName = capitalize(propName) + 's'
    previewNames.push(funcName)

    lines.push(`export function ${funcName}() {`)
    lines.push('  return (')
    lines.push('    <div className="flex flex-wrap items-center gap-4">')
    for (const value of values) {
      lines.push(`      <${pascalName} ${propName}="${value}">${capitalize(value)}</${pascalName}>`)
    }
    lines.push('    </div>')
    lines.push('  )')
    lines.push('}')
    lines.push('')
  }
}

// --- Strategy: Stateless Simple (input, separator) ---

function generateStatelessSimple(
  lines: string[],
  previewNames: string[],
  meta: ComponentMeta,
  pascalName: string,
): void {
  previewNames.push('Default')
  lines.push('export function Default() {')

  // Use first simple (static JSX) example if available
  const simpleExample = meta.examples.find(e => isSimpleJsx(e.code))

  if (simpleExample) {
    emitJsxReturn(lines, simpleExample.code)
  } else {
    const hasChildren = meta.props.some(p => p.name === 'children')
    if (hasChildren) {
      lines.push(`  return <${pascalName}>${meta.title}</${pascalName}>`)
    } else {
      lines.push(`  return <${pascalName} />`)
    }
  }

  lines.push('}')
  lines.push('')
}

// --- Strategy: Stateful Simple (checkbox, switch) ---

function generateStateful(
  lines: string[],
  previewNames: string[],
  meta: ComponentMeta,
  pascalName: string,
): void {
  previewNames.push('Default')
  lines.push('export function Default() {')
  lines.push('  return (')
  lines.push('    <div className="flex gap-4">')

  // Bare component
  lines.push(`      <${pascalName} />`)

  // With default state prop set (defaultChecked, defaultPressed, etc.)
  const defaultStateProp = meta.props.find(p =>
    p.name === 'defaultChecked' || p.name === 'defaultPressed' ||
    p.name === 'defaultValue' || p.name === 'defaultOpen'
  )
  if (defaultStateProp) {
    lines.push(`      <${pascalName} ${defaultStateProp.name} />`)
  }

  // Disabled state
  if (meta.props.some(p => p.name === 'disabled')) {
    lines.push(`      <${pascalName} disabled />`)
  }

  lines.push('    </div>')
  lines.push('  )')
  lines.push('}')
  lines.push('')
}

// --- Strategy: Stateful + Variants (toggle) ---

function generateStatefulWithVariants(
  lines: string[],
  previewNames: string[],
  meta: ComponentMeta,
  pascalName: string,
): void {
  // Default preview (reuse stateful simple logic)
  generateStateful(lines, previewNames, meta, pascalName)

  // Variant previews
  const hasChildren = meta.props.some(p => p.name === 'children')
  for (const [typeName, values] of Object.entries(meta.variants!)) {
    const propName = inferVariantPropName(typeName, meta.props)
    if (!propName) continue

    const funcName = capitalize(propName) + 's'
    previewNames.push(funcName)

    lines.push(`export function ${funcName}() {`)
    lines.push('  return (')
    lines.push('    <div className="flex flex-wrap items-center gap-4">')
    for (const value of values) {
      if (hasChildren) {
        lines.push(`      <${pascalName} ${propName}="${value}">${capitalize(value)}</${pascalName}>`)
      } else {
        lines.push(`      <${pascalName} ${propName}="${value}" />`)
      }
    }
    lines.push('    </div>')
    lines.push('  )')
    lines.push('}')
    lines.push('')
  }
}

// --- Strategy: Multi-component (accordion, card, dialog) ---

function generateMultiComponent(
  lines: string[],
  previewNames: string[],
  meta: ComponentMeta,
  pascalName: string,
  _subNames: string[],
): void {
  previewNames.push('Default')

  if (meta.examples.length > 0) {
    const example = meta.examples[0]
    const { statements, jsx } = splitExampleCode(example.code)

    lines.push('export function Default() {')

    // Emit statements from example
    for (const stmt of statements) {
      lines.push(`  ${stmt}`)
    }

    // Inject no-op handlers for undefined handleXxx references in JSX
    const definedNames = new Set(
      statements.flatMap(s => [...s.matchAll(/\b(?:const|let|var)\s+(?:\[([^\]]+)\]|(\w+))/g)])
        .flatMap(m => (m[1] ? m[1].split(',').map(v => v.trim()) : [m[2]]))
    )
    const handlerRefs = [...new Set([...jsx.matchAll(/\b(handle[A-Z]\w*)\b/g)].map(m => m[1]))]
    for (const h of handlerRefs) {
      if (!definedNames.has(h)) {
        lines.push(`  const ${h} = () => {}`)
      }
    }

    if (statements.length > 0 || handlerRefs.length > 0) {
      lines.push('')
    }

    emitJsxReturn(lines, jsx)

    lines.push('}')
  } else {
    // No examples: generate basic composition from sub-component structure
    lines.push('export function Default() {')
    lines.push('  return (')
    lines.push(`    <${pascalName}>`)

    for (const sub of meta.subComponents!) {
      const hasChildrenProp = sub.props.some(p => p.name === 'children')
      const label = sub.name.replace(pascalName, '') || sub.name
      if (hasChildrenProp) {
        lines.push(`      <${sub.name}>${label}</${sub.name}>`)
      } else {
        lines.push(`      <${sub.name} />`)
      }
    }

    lines.push(`    </${pascalName}>`)
    lines.push('  )')
    lines.push('}')
  }

  lines.push('')
}
