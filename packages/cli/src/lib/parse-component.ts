// Regex-based TSX parser for extracting component metadata.
// Designed for BarefootJS component conventions — not a general-purpose parser.

import type { PropMeta, SubComponentMeta, ExampleMeta, AccessibilityMeta, DependencyMeta } from './types'

export interface ParseResult {
  useClient: boolean
  description: string
  examples: ExampleMeta[]
  props: PropMeta[]
  subComponents: SubComponentMeta[]
  variants: Record<string, string[]>
  accessibility: AccessibilityMeta
  dependencies: DependencyMeta
  exportedNames: string[]
}

/**
 * Parse a TSX component file and extract metadata.
 */
export function parseComponent(source: string): ParseResult {
  return {
    useClient: detectUseClient(source),
    description: extractTopLevelDescription(source),
    examples: extractExamples(source),
    props: extractMainProps(source),
    subComponents: extractSubComponents(source),
    variants: extractVariants(source),
    accessibility: extractAccessibility(source),
    dependencies: extractDependencies(source),
    exportedNames: extractExportedNames(source),
  }
}

/**
 * Detect "use client" directive on the first line.
 */
function detectUseClient(source: string): boolean {
  const firstLine = source.split('\n')[0].trim()
  return firstLine === '"use client"' || firstLine === "'use client'"
}

/**
 * Extract the top-level JSDoc block (first /** ... *​/ before any import/function).
 * Returns only the description text, not @example blocks.
 */
function extractTopLevelDescription(source: string): string {
  // Find the first JSDoc block that appears before any interface/function
  const match = source.match(/^(?:"use client"\n+)?\/\*\*\n([\s\S]*?)\*\//m)
  if (!match) return ''

  const block = match[1]
  const lines = block.split('\n')

  const descLines: string[] = []
  for (const line of lines) {
    const cleaned = line.replace(/^\s*\*\s?/, '').trim()
    // Stop at @example or other tags
    if (cleaned.startsWith('@')) break
    descLines.push(cleaned)
  }

  // Join, collapse whitespace, and trim
  return descLines
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extract @example blocks from the top-level JSDoc.
 */
function extractExamples(source: string): ExampleMeta[] {
  const match = source.match(/^(?:"use client"\n+)?\/\*\*\n([\s\S]*?)\*\//m)
  if (!match) return []

  const block = match[1]
  const examples: ExampleMeta[] = []
  const exampleRegex = /@example\s+(.*?)(?:\n\s*\*\s*```tsx?\n([\s\S]*?)```)/g

  let m: RegExpExecArray | null
  while ((m = exampleRegex.exec(block)) !== null) {
    const title = m[1].trim()
    const code = m[2]
      .split('\n')
      .map(l => l.replace(/^\s*\*\s?/, ''))
      .join('\n')
      .trim()
    examples.push({ title, code })
  }

  return examples
}

/**
 * Extract the main (first) props interface from a component file.
 * Finds the first `interface XxxProps` block.
 */
function extractMainProps(source: string): PropMeta[] {
  // Find the first Props interface
  const match = source.match(/interface\s+(\w+Props)\s+(?:extends\s+[\w<>,\s]+\s+)?\{/)
  if (!match) return []

  return extractPropsFromInterface(source, match.index!)
}

/**
 * Extract props from an interface starting at a given position.
 */
function extractPropsFromInterface(source: string, startIndex: number): PropMeta[] {
  // Find the balanced braces for this interface
  const bodyStart = source.indexOf('{', startIndex)
  if (bodyStart === -1) return []

  let depth = 0
  let bodyEnd = bodyStart
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) {
        bodyEnd = i
        break
      }
    }
  }

  const body = source.slice(bodyStart + 1, bodyEnd)
  return parsePropsBody(body)
}

/**
 * Parse the body of a Props interface to extract individual props.
 */
function parsePropsBody(body: string): PropMeta[] {
  const props: PropMeta[] = []

  // Match JSDoc + prop definition patterns
  // Each prop may or may not have a preceding JSDoc comment
  const propRegex = /(?:\/\*\*\s*([\s\S]*?)\s*\*\/\s*)?([\w]+)(\??):\s*([^\n]+)/g

  let m: RegExpExecArray | null
  while ((m = propRegex.exec(body)) !== null) {
    const jsdoc = m[1] || ''
    const name = m[2]
    const optional = m[3] === '?'
    const rawType = m[4].trim()

    // Skip internal props (compiler-generated)
    if (name.startsWith('__')) continue

    // Clean up the type (remove trailing semicolons, comments)
    const type = rawType.replace(/;?\s*$/, '').trim()

    // Extract description from JSDoc
    const description = extractPropDescription(jsdoc)

    // Extract @default value
    const defaultMatch = jsdoc.match(/@default\s+(.+?)(?:\s*$|\s*\*)/m)
    const defaultValue = defaultMatch ? defaultMatch[1].trim().replace(/^['"]|['"]$/g, '') : undefined

    props.push({
      name,
      type,
      required: !optional && defaultValue === undefined,
      default: defaultValue,
      description,
    })
  }

  return props
}

/**
 * Extract a clean description from a prop's JSDoc.
 */
function extractPropDescription(jsdoc: string): string {
  if (!jsdoc) return ''

  const lines = jsdoc.split('\n')
  const descLines: string[] = []

  for (const line of lines) {
    const cleaned = line.replace(/^\s*\*?\s*/, '').trim()
    if (cleaned.startsWith('@')) break
    if (cleaned) descLines.push(cleaned)
  }

  return descLines.join(' ').trim()
}

/**
 * Extract sub-components and their props.
 * A sub-component is an exported function that isn't the main component.
 */
function extractSubComponents(source: string): SubComponentMeta[] {
  const exportedNames = extractExportedNames(source)
  if (exportedNames.length <= 1) return []

  const subs: SubComponentMeta[] = []

  // Find all interface definitions for sub-components
  const interfaceRegex = /interface\s+(\w+Props)\s+(?:extends\s+[\w<>,\s]+\s+)?\{/g

  // Collect all interfaces and their positions
  const interfaces: { name: string; index: number }[] = []
  let im: RegExpExecArray | null
  while ((im = interfaceRegex.exec(source)) !== null) {
    interfaces.push({ name: im[1], index: im.index })
  }

  // The first interface is the main component props — skip it
  for (let i = 1; i < interfaces.length; i++) {
    const iface = interfaces[i]
    const componentName = iface.name.replace(/Props$/, '')

    // Only include if it's actually exported
    if (!exportedNames.includes(componentName)) continue

    // Extract JSDoc description for this sub-component
    const beforeInterface = source.slice(Math.max(0, iface.index - 300), iface.index)
    const jsdocMatch = beforeInterface.match(/\/\*\*\s*([\s\S]*?)\s*\*\/\s*$/)
    const description = jsdocMatch ? extractPropDescription(jsdocMatch[1]) : ''

    const props = extractPropsFromInterface(source, iface.index)

    subs.push({ name: componentName, description, props })
  }

  return subs
}

/**
 * Extract variant/union type definitions.
 * Looks for `type XxxVariant = 'a' | 'b'` and `type XxxSize = 'a' | 'b'`.
 */
function extractVariants(source: string): Record<string, string[]> {
  const variants: Record<string, string[]> = {}
  const typeRegex = /type\s+(\w+(?:Variant|Size|Orientation|Side|Position))\s*=\s*([^\n]+)/g

  let m: RegExpExecArray | null
  while ((m = typeRegex.exec(source)) !== null) {
    const name = m[1]
    const values = m[2].match(/'([^']+)'/g)
    if (values) {
      variants[name] = values.map(v => v.replace(/'/g, ''))
    }
  }

  return variants
}

/**
 * Extract accessibility-related attributes from JSX.
 */
function extractAccessibility(source: string): AccessibilityMeta {
  // Find role attributes
  const roleMatches = source.match(/role[={"]+([^"}\s]+)/g)
  const roles = new Set<string>()
  if (roleMatches) {
    for (const rm of roleMatches) {
      const val = rm.match(/role[={"]+([^"}\s]+)/)
      if (val) roles.add(val[1])
    }
  }

  // Find aria attributes
  const ariaMatches = source.match(/aria-[\w]+/g)
  const ariaAttrs = [...new Set(ariaMatches || [])]

  // Find data attributes
  const dataMatches = source.match(/data-(?:state|slot|orientation|value|disabled|side)[\w-]*/g)
  const dataAttrs = [...new Set(dataMatches || [])]

  return {
    role: roles.size > 0 ? [...roles].join(', ') : undefined,
    ariaAttributes: ariaAttrs,
    dataAttributes: dataAttrs,
  }
}

/**
 * Extract dependency information.
 */
function extractDependencies(source: string): DependencyMeta {
  const internal: string[] = []
  const external: string[] = []

  const importRegex = /import\s+(?:type\s+)?(?:\{[^}]*\}|[\w]+)\s+from\s+['"]([^'"]+)['"]/g

  let m: RegExpExecArray | null
  while ((m = importRegex.exec(source)) !== null) {
    const specifier = m[1]
    // Skip type-only imports
    if (m[0].includes('import type')) continue

    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      // Internal: extract component name from relative path
      const parts = specifier.split('/')
      const name = parts[parts.length - 1].replace(/\.tsx?$/, '')
      if (name !== 'types' && name !== 'index') {
        internal.push(name)
      }
    } else {
      external.push(specifier)
    }
  }

  return {
    internal: [...new Set(internal)],
    external: [...new Set(external)],
  }
}

/**
 * Extract exported names (non-type exports).
 *
 * Accepts every TS export form a BarefootJS component might use:
 *   - `export { Foo, Bar }`            — `bf gen component` output (registry style)
 *   - `export function Foo() {}`       — top-level page components (scaffold's Counter)
 *   - `export const Foo = …`           — arrow-function components
 *   - `export default function Foo()`  — same as above, default form
 *   - `export default Foo`             — re-export of a previously-declared name
 *
 * The result feeds `bf gen test`'s describe-block generator, so any
 * unrecognised form silently produces a stub-only test file — the
 * onboarding papercut tracked in #1403.
 */
function extractExportedNames(source: string): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  const add = (n: string | undefined | null) => {
    if (!n) return
    const trimmed = n.trim()
    if (!trimmed || seen.has(trimmed)) return
    if (trimmed.startsWith('type ')) return
    seen.add(trimmed)
    names.push(trimmed)
  }

  // `export { Foo, Bar as Baz, type Qux }`
  const braceRegex = /export\s+\{([^}]+)\}/g
  let bm: RegExpExecArray | null
  while ((bm = braceRegex.exec(source)) !== null) {
    for (const part of bm[1].split(',')) {
      const trimmed = part.trim()
      if (!trimmed || trimmed.startsWith('type ')) continue
      const asMatch = trimmed.match(/\s+as\s+(\w+)$/)
      add(asMatch ? asMatch[1] : trimmed)
    }
  }

  // `export function Foo`, `export async function Foo`, `export default function Foo`
  const fnRegex = /export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/g
  let fm: RegExpExecArray | null
  while ((fm = fnRegex.exec(source)) !== null) add(fm[1])

  // `export const Foo = …` / `let` / `var`
  const varRegex = /export\s+(?:const|let|var)\s+(\w+)\s*[=:]/g
  let vm: RegExpExecArray | null
  while ((vm = varRegex.exec(source)) !== null) add(vm[1])

  // `export default Foo;` — bare identifier; only useful when not
  // already added via a sibling `function`/`const` form earlier.
  const defaultRegex = /export\s+default\s+(\w+)\s*;?\s*$/m
  const dm = defaultRegex.exec(source)
  if (dm) add(dm[1])

  return names
}
