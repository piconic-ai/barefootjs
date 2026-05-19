// Generate an IR test template from a component source file.
// Reads the .tsx source, parses it, and outputs a ready-to-use test file.

import { readFileSync } from 'fs'
import path from 'path'
import { parseComponent } from './parse-component'

/**
 * Generate an IR test file for a component.
 * @param componentPath - Absolute path to the .tsx file
 * @returns The generated test file content as a string
 */
export function generateTestTemplate(componentPath: string): string {
  const source = readFileSync(componentPath, 'utf-8')
  const parsed = parseComponent(source)
  const fileName = path.basename(componentPath)
  const baseName = fileName.replace(/\.tsx$/, '')

  // Match the layout `bf gen component` writes — test sits next to the
  // source (`components/ui/foo/index.tsx` + `…/index.test.tsx`) — so the
  // generated `readFileSync` reaches its source via a bare filename
  // rather than a `../` hop into a `__tests__/` subdir we don't actually
  // create anywhere in the scaffold (#1403 papercut).
  const relativePath = fileName

  const varName = toCamelCase(baseName) + 'Source'
  const exportedNames = parsed.exportedNames
  const mainComponent = exportedNames[0]
  const hasSubComponents = exportedNames.length > 1

  const lines: string[] = []

  // Header
  lines.push(`import { describe, test, expect } from 'bun:test'`)
  lines.push(`import { readFileSync } from 'fs'`)
  lines.push(`import { resolve } from 'path'`)
  lines.push(`import { renderToTest } from '@barefootjs/test'`)
  lines.push(``)
  lines.push(`const ${varName} = readFileSync(resolve(__dirname, '${relativePath}'), 'utf-8')`)
  lines.push(``)

  // Main component describe block
  if (mainComponent) {
    lines.push(...generateDescribeBlock(source, parsed, mainComponent, varName, fileName, hasSubComponents))
  }

  // Sub-component describe blocks
  if (hasSubComponents) {
    for (let i = 1; i < exportedNames.length; i++) {
      lines.push(``)
      lines.push(...generateDescribeBlock(source, parsed, exportedNames[i], varName, fileName, true))
    }
  }

  return lines.join('\n') + '\n'
}

interface ParsedInfo {
  useClient: boolean
  accessibility: { role?: string; ariaAttributes: string[]; dataAttributes: string[] }
  variants: Record<string, string[]>
}

function generateDescribeBlock(
  source: string,
  parsed: ParsedInfo,
  componentName: string,
  varName: string,
  fileName: string,
  multiComponent: boolean,
): string[] {
  const lines: string[] = []
  const renderArg = multiComponent ? `, '${componentName}'` : ''

  // Detect component-specific info by scanning source for this component's function
  const funcInfo = analyzeFunction(source, componentName)

  lines.push(`describe('${componentName}', () => {`)
  lines.push(`  const result = renderToTest(${varName}, '${fileName}'${renderArg})`)
  lines.push(``)

  // Always: no compiler errors
  lines.push(`  test('has no compiler errors', () => {`)
  lines.push(`    expect(result.errors).toEqual([])`)
  lines.push(`  })`)
  lines.push(``)

  // Component name
  lines.push(`  test('componentName is ${componentName}', () => {`)
  lines.push(`    expect(result.componentName).toBe('${componentName}')`)
  lines.push(`  })`)
  lines.push(``)

  // Signals
  if (funcInfo.signals.length > 0) {
    lines.push(`  test('has expected signals', () => {`)
    for (const sig of funcInfo.signals) {
      lines.push(`    expect(result.signals).toContain('${sig}')`)
    }
    lines.push(`  })`)
  } else {
    lines.push(`  test('no signals (stateless)', () => {`)
    lines.push(`    expect(result.signals).toEqual([])`)
    lines.push(`  })`)
  }
  lines.push(``)

  // Root element
  if (funcInfo.rootTag) {
    lines.push(`  test('renders as <${funcInfo.rootTag}>', () => {`)
    if (funcInfo.hasConditionalReturn) {
      lines.push(`    // Component has conditional return (e.g., asChild branch)`)
      lines.push(`    expect(result.find({ tag: '${funcInfo.rootTag}' })).not.toBeNull()`)
    } else {
      lines.push(`    expect(result.root.tag).toBe('${funcInfo.rootTag}')`)
    }
    lines.push(`  })`)
    lines.push(``)
  }

  // data-slot
  if (funcInfo.dataSlot) {
    lines.push(`  test('has data-slot=${funcInfo.dataSlot}', () => {`)
    if (funcInfo.hasConditionalReturn) {
      lines.push(`    const el = result.find({ tag: '${funcInfo.rootTag}' })!`)
      lines.push(`    expect(el.props['data-slot']).toBe('${funcInfo.dataSlot}')`)
    } else {
      lines.push(`    expect(result.root.props['data-slot']).toBe('${funcInfo.dataSlot}')`)
    }
    lines.push(`  })`)
    lines.push(``)
  }

  // Role
  if (funcInfo.role) {
    lines.push(`  test('has role=${funcInfo.role}', () => {`)
    lines.push(`    const el = result.find({ role: '${funcInfo.role}' })`)
    lines.push(`    expect(el).not.toBeNull()`)
    lines.push(`  })`)
    lines.push(``)
  }

  // ARIA attributes
  const ariaAttrs = funcInfo.ariaAttributes
  if (ariaAttrs.length > 0) {
    lines.push(`  test('has ARIA attributes', () => {`)
    const findTarget = funcInfo.role
      ? `result.find({ role: '${funcInfo.role}' })!`
      : funcInfo.rootTag
        ? `result.find({ tag: '${funcInfo.rootTag}' })!`
        : 'result.root'
    lines.push(`    const el = ${findTarget}`)
    for (const attr of ariaAttrs) {
      const shortName = attr.replace('aria-', '')
      lines.push(`    expect(el.aria).toHaveProperty('${shortName}')`)
    }
    lines.push(`  })`)
    lines.push(``)
  }

  // data-state
  if (funcInfo.hasDataState) {
    lines.push(`  test('has data-state attribute', () => {`)
    if (funcInfo.hasConditionalReturn) {
      lines.push(`    const el = result.find({ tag: '${funcInfo.rootTag}' })!`)
      lines.push(`    expect(el.dataState).not.toBeNull()`)
    } else {
      lines.push(`    expect(result.root.dataState).not.toBeNull()`)
    }
    lines.push(`  })`)
    lines.push(``)
  }

  // Events
  if (funcInfo.events.length > 0) {
    lines.push(`  test('has event handlers', () => {`)
    const findTarget = funcInfo.role
      ? `result.find({ role: '${funcInfo.role}' })!`
      : funcInfo.rootTag
        ? `result.find({ tag: '${funcInfo.rootTag}' })!`
        : 'result.root'
    lines.push(`    const el = ${findTarget}`)
    for (const event of funcInfo.events) {
      lines.push(`    expect(el.events).toContain('${event}')`)
    }
    lines.push(`  })`)
    lines.push(``)
  }

  // Child components
  if (funcInfo.childComponents.length > 0) {
    lines.push(`  test('contains child components', () => {`)
    for (const child of funcInfo.childComponents) {
      lines.push(`    expect(result.find({ componentName: '${child}' })).not.toBeNull()`)
    }
    lines.push(`  })`)
    lines.push(``)
  }

  // toStructure
  lines.push(`  test('toStructure() shows expected tree', () => {`)
  lines.push(`    const structure = result.toStructure()`)
  lines.push(`    expect(structure.length).toBeGreaterThan(0)`)
  if (funcInfo.rootTag) {
    lines.push(`    expect(structure).toContain('${funcInfo.rootTag}')`)
  }
  if (funcInfo.role) {
    lines.push(`    expect(structure).toContain('[role=${funcInfo.role}]')`)
  }
  lines.push(`  })`)

  lines.push(`})`)

  return lines
}

interface FunctionInfo {
  signals: string[]
  rootTag: string | null
  dataSlot: string | null
  role: string | null
  ariaAttributes: string[]
  hasDataState: boolean
  hasConditionalReturn: boolean
  events: string[]
  childComponents: string[]
}

function analyzeFunction(source: string, componentName: string): FunctionInfo {
  // Find the function body for this component
  const funcRegex = new RegExp(`function\\s+${componentName}\\s*\\(`)
  const funcMatch = funcRegex.exec(source)

  // Default: analyze the whole source
  let funcBody = source
  if (!funcMatch) {
    // Check for alias pattern: const DialogRoot = Dialog
    const aliasMatch = source.match(new RegExp(`const\\s+${componentName}\\s*=\\s*(\\w+)`))
    if (aliasMatch) {
      // Recurse with the original name
      return analyzeFunction(source, aliasMatch[1])
    }
  }
  if (funcMatch) {
    // First, skip past the parameter list's closing ')' to avoid
    // confusing destructured params { ... } with the function body { ... }
    const parenStart = source.indexOf('(', funcMatch.index)
    let parenDepth = 0
    let parenEnd = parenStart
    for (let i = parenStart; i < source.length; i++) {
      if (source[i] === '(') parenDepth++
      else if (source[i] === ')') {
        parenDepth--
        if (parenDepth === 0) { parenEnd = i; break }
      }
    }

    // Now find the function body '{' after the closing ')'
    let depth = 0
    let bodyStart = -1
    for (let i = parenEnd + 1; i < source.length; i++) {
      if (source[i] === '{') {
        if (bodyStart === -1) bodyStart = i
        depth++
      } else if (source[i] === '}') {
        depth--
        if (depth === 0) {
          funcBody = source.slice(bodyStart, i + 1)
          break
        }
      }
    }
  }

  // Signals: look for createSignal calls
  const signals: string[] = []
  const signalRegex = /const\s+\[(\w+),\s*\w+\]\s*=\s*createSignal/g
  let sm
  while ((sm = signalRegex.exec(funcBody)) !== null) {
    signals.push(sm[1])
  }

  // Root tag: find the LAST return's tag (skip conditional/asChild branches)
  const returnMatches = [...funcBody.matchAll(/return\s*\(?\s*<(\w+)/g)]
  const rootTag = returnMatches.length > 0 ? returnMatches[returnMatches.length - 1][1] : null

  // data-slot: prefer the slot matching the component name (kebab-case)
  const allSlots = [...funcBody.matchAll(/data-slot="([^"]+)"/g)].map(m => m[1])
  const expectedSlot = componentName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  const dataSlot = allSlots.find(s => s === expectedSlot) || allSlots[0] || null

  // Role
  const roleMatch = funcBody.match(/role="([^"]+)"/)
  const role = roleMatch ? roleMatch[1] : null

  // ARIA attributes in JSX
  const ariaMatches = funcBody.match(/aria-[\w]+(?==)/g)
  const ariaAttributes = [...new Set(ariaMatches || [])].filter(a => a !== 'aria-invalid')

  // data-state
  const hasDataState = /data-state=/.test(funcBody)

  // Conditional return (asChild pattern)
  const hasConditionalReturn = /if\s*\(.*\)\s*\{?\s*return/.test(funcBody)

  // Event handlers in JSX
  const events: string[] = []
  if (/onClick=/.test(funcBody)) events.push('click')
  if (/onInput=/.test(funcBody)) events.push('input')
  if (/onChange=/.test(funcBody)) events.push('change')
  if (/onKeyDown=/.test(funcBody)) events.push('keydown')

  // Child components (PascalCase tags in JSX, excluding HTML elements)
  const childCompRegex = /<([A-Z][A-Za-z]+)[\s/>]/g
  const childComponents: string[] = []
  let cm
  while ((cm = childCompRegex.exec(funcBody)) !== null) {
    if (!childComponents.includes(cm[1])) {
      childComponents.push(cm[1])
    }
  }

  return {
    signals,
    rootTag,
    dataSlot,
    role,
    ariaAttributes,
    hasDataState,
    hasConditionalReturn,
    events,
    childComponents,
  }
}

function toCamelCase(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}
