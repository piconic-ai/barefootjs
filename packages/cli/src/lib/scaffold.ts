// Generate a component skeleton + basic IR test from a list of component names.

import { readFileSync, existsSync } from 'fs'
import path from 'path'
import type { ComponentMeta } from './types'

function loadMeta(metaDir: string, name: string): ComponentMeta | null {
  const filePath = path.join(metaDir, `${name}.json`)
  if (!existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

function toPascalCase(kebab: string): string {
  return kebab.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('')
}

function toCamelCase(kebab: string): string {
  const pascal = toPascalCase(kebab)
  return pascal[0].toLowerCase() + pascal.slice(1)
}

export interface ScaffoldResult {
  componentCode: string
  testCode: string
  componentPath: string
  testPath: string
}

/**
 * Generate a component skeleton and basic IR test.
 * @param componentName - Name for the new component (kebab-case, e.g. "settings-form")
 * @param useComponents - Names of existing components to compose (e.g. ["input", "switch", "button"])
 * @param metaDir - Where to find existing component meta JSON (drives the
 *   `"use client"` decision + sub-component import list).
 * @param componentsBasePath - Directory the new component is written under,
 *   relative to the project root. Monorepo: `ui/components/ui` (default).
 *   Scaffolded app: pass `barefoot.config.ts`'s `paths.components`
 *   (typically `components/ui`) so files don't land in `node_modules/ui/...`.
 */
export function scaffold(
  componentName: string,
  useComponents: string[],
  metaDir: string,
  componentsBasePath: string = 'ui/components/ui',
): ScaffoldResult {
  const metas = useComponents.map(name => ({ name, meta: loadMeta(metaDir, name) }))
  const found = metas.filter(m => m.meta !== null) as { name: string; meta: ComponentMeta }[]
  const notFound = metas.filter(m => m.meta === null).map(m => m.name)

  // Determine if any used component is stateful → new component needs "use client"
  const needsClient = found.some(m => m.meta.stateful)

  // Collect exports to import from each component
  const imports = buildImports(found)

  // Generate component code
  const componentCode = generateComponentCode(componentName, imports, needsClient, notFound)

  // Generate test code
  const testCode = generateTestCode(componentName, needsClient)

  const basePath = `${componentsBasePath}/${componentName}`

  return {
    componentCode,
    testCode,
    componentPath: `${basePath}/index.tsx`,
    testPath: `${basePath}/index.test.tsx`,
  }
}

interface ImportInfo {
  from: string
  names: string[]
}

function buildImports(components: { name: string; meta: ComponentMeta }[]): ImportInfo[] {
  const imports: ImportInfo[] = []

  for (const { name, meta } of components) {
    // Main component export name (PascalCase)
    const names: string[] = [toPascalCase(name)]

    // Add sub-component names if any
    if (meta.subComponents) {
      for (const sub of meta.subComponents) {
        names.push(sub.name)
      }
    }

    imports.push({ from: `../${name}`, names })
  }

  return imports
}

function generateComponentCode(
  componentName: string,
  imports: ImportInfo[],
  needsClient: boolean,
  notFound: string[],
): string {
  const pascalName = toPascalCase(componentName)
  const lines: string[] = []

  if (needsClient) {
    lines.push(`"use client"`)
    lines.push(``)
    lines.push(`import { createSignal } from '@barefootjs/client'`)
  }

  lines.push(`import type { Child } from '../../../types'`)

  for (const imp of imports) {
    lines.push(`import { ${imp.names.join(', ')} } from '${imp.from}'`)
  }

  if (notFound.length > 0) {
    lines.push(``)
    lines.push(`// WARNING: These components were not found in ui/meta/:`)
    for (const name of notFound) {
      lines.push(`// - ${name}`)
    }
  }

  lines.push(``)
  lines.push(`interface ${pascalName}Props {`)
  lines.push(`  /** Additional CSS classes. */`)
  lines.push(`  className?: string`)
  lines.push(`  /** Children to render. */`)
  lines.push(`  children?: Child`)
  lines.push(`}`)
  lines.push(``)

  if (needsClient) {
    lines.push(`function ${pascalName}(props: ${pascalName}Props) {`)
    lines.push(`  // TODO: Add signals`)
    lines.push(`  // const [value, setValue] = createSignal(...)`)
    lines.push(``)
    lines.push(`  return (`)
    lines.push(`    <div data-slot="${componentName}">`)
    lines.push(`      {/* TODO: Compose components */}`)
    lines.push(`    </div>`)
    lines.push(`  )`)
    lines.push(`}`)
  } else {
    lines.push(`function ${pascalName}({`)
    lines.push(`  className = '',`)
    lines.push(`  children,`)
    lines.push(`  ...props`)
    lines.push(`}: ${pascalName}Props) {`)
    lines.push(`  return (`)
    lines.push(`    <div data-slot="${componentName}" className={className}>`)
    lines.push(`      {/* TODO: Compose components */}`)
    lines.push(`      {children}`)
    lines.push(`    </div>`)
    lines.push(`  )`)
    lines.push(`}`)
  }

  lines.push(``)
  lines.push(`export { ${pascalName} }`)
  lines.push(`export type { ${pascalName}Props }`)
  lines.push(``)

  return lines.join('\n')
}

function generateTestCode(componentName: string, needsClient: boolean): string {
  const pascalName = toPascalCase(componentName)
  const varName = toCamelCase(componentName) + 'Source'
  const lines: string[] = []

  lines.push(`import { describe, test, expect } from 'bun:test'`)
  lines.push(`import { readFileSync } from 'fs'`)
  lines.push(`import { resolve } from 'path'`)
  lines.push(`import { renderToTest } from '@barefootjs/test'`)
  lines.push(``)
  lines.push(`const ${varName} = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')`)
  lines.push(``)
  lines.push(`describe('${pascalName}', () => {`)
  lines.push(`  const result = renderToTest(${varName}, '${componentName}.tsx')`)
  lines.push(``)
  lines.push(`  test('has no compiler errors', () => {`)
  lines.push(`    expect(result.errors).toEqual([])`)
  lines.push(`  })`)
  lines.push(``)
  lines.push(`  test('componentName is ${pascalName}', () => {`)
  lines.push(`    expect(result.componentName).toBe('${pascalName}')`)
  lines.push(`  })`)
  lines.push(``)

  if (needsClient) {
    lines.push(`  test('isClient is true', () => {`)
    lines.push(`    expect(result.isClient).toBe(true)`)
    lines.push(`  })`)
  }

  lines.push(``)
  lines.push(`  test('renders as <div>', () => {`)
  lines.push(`    expect(result.root.tag).toBe('div')`)
  lines.push(`  })`)
  lines.push(``)
  lines.push(`  test('has data-slot=${componentName}', () => {`)
  lines.push(`    expect(result.root.props['data-slot']).toBe('${componentName}')`)
  lines.push(`  })`)
  lines.push(``)
  lines.push(`  test('toStructure() shows expected tree', () => {`)
  lines.push(`    const structure = result.toStructure()`)
  lines.push(`    expect(structure.length).toBeGreaterThan(0)`)
  lines.push(`  })`)
  lines.push(`})`)
  lines.push(``)

  return lines.join('\n')
}
