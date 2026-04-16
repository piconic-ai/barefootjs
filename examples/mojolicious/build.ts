/**
 * Build script for Mojolicious EP template example
 *
 * Compiles JSX components to .html.ep template files + client JS.
 * Produces separate template files per component (parent + child).
 */

import { analyzeComponent, listExportedComponents, jsxToIR, generateClientJs, combineParentChildClientJs, type ComponentIR, type AnalyzerContext, type IRNode } from '@barefootjs/jsx'
import { MojoAdapter } from '@barefootjs/mojolicious'
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const projectRoot = import.meta.dirname
const outputDir = resolve(projectRoot, 'dist')
const templatesDir = resolve(outputDir, 'templates')
const clientDir = resolve(outputDir, 'client')

// Create output directories
mkdirSync(templatesDir, { recursive: true })
mkdirSync(clientDir, { recursive: true })

// Build and copy barefoot.js from @barefootjs/client-runtime
const domPkgDir = resolve(projectRoot, '../../packages/client-runtime')
const domDistFile = resolve(domPkgDir, 'dist/index.js')

console.log('Preparing @barefootjs/client-runtime runtime...')
if (!existsSync(domDistFile)) {
  console.log('  Building @barefootjs/client-runtime...')
  spawnSync('bun', ['run', 'build'], { cwd: domPkgDir, stdio: 'inherit' })
}
copyFileSync(domDistFile, resolve(clientDir, 'barefoot.js'))
console.log('  Copied: barefoot.js\n')

// Components to compile
const components = [
  '../shared/components/Counter.tsx',
  '../shared/components/Form.tsx',
  '../shared/components/ConditionalReturn.tsx',
  '../shared/components/Toggle.tsx',
  '../shared/components/TodoItem.tsx',
  '../shared/components/TodoApp.tsx',
  '../shared/components/TodoAppSSR.tsx',
  '../shared/components/ReactiveProps.tsx',
  '../shared/components/PortalExample.tsx',
  '../shared/components/AIChatInteractive.tsx',
]

const adapter = new MojoAdapter({
  clientJsBasePath: '/client/',
  barefootJsPath: '/client/barefoot.js',
})

/**
 * Build ComponentIR from analyzer context and IR root node.
 */
function buildIR(ctx: AnalyzerContext, root: IRNode): ComponentIR {
  return {
    version: '0.1',
    metadata: {
      componentName: ctx.componentName!,
      hasDefaultExport: ctx.hasDefaultExport,
      isExported: ctx.isExported,
      isClientComponent: ctx.hasUseClientDirective,
      typeDefinitions: ctx.typeDefinitions,
      propsType: ctx.propsType,
      propsParams: ctx.propsParams,
      restPropsName: ctx.restPropsName,
      propsObjectName: ctx.propsObjectName,
      restPropsExpandedKeys: ctx.restPropsExpandedKeys,
      signals: ctx.signals,
      memos: ctx.memos,
      effects: ctx.effects,
      onMounts: ctx.onMounts,
      imports: ctx.imports,
      templateImports: ctx.imports.filter(imp =>
        imp.source !== '@barefootjs/client-runtime' && imp.source !== '@barefootjs/client'
      ),
      localFunctions: ctx.localFunctions,
      localConstants: ctx.localConstants,
    },
    root,
    errors: [],
  }
}

console.log('Building Mojolicious EP templates...\n')

for (const componentPath of components) {
  const fullPath = resolve(projectRoot, componentPath)
  const source = readFileSync(fullPath, 'utf-8')

  // Find all component functions in the file
  const allComponentNames = listExportedComponents(source, componentPath)

  // Find the default export component name (used as scriptBaseName for non-default exports)
  let defaultExportName: string | null = null
  for (const name of allComponentNames) {
    const ctx = analyzeComponent(source, componentPath, name)
    if (ctx.hasDefaultExport) {
      defaultExportName = name
      break
    }
  }

  let mainComponentIR: ComponentIR | null = null

  for (const targetComponentName of allComponentNames) {
    const ctx = analyzeComponent(source, componentPath, targetComponentName)

    const errors = ctx.errors.filter(e => e.severity === 'error')
    const warnings = ctx.errors.filter(e => e.severity === 'warning')

    if (warnings.length > 0) {
      for (const w of warnings) console.warn(`  ⚠ ${w.message}`)
    }
    if (errors.length > 0) {
      console.error(`Errors compiling ${targetComponentName} in ${componentPath}:`)
      for (const e of errors) console.error(`  ${e.message}`)
      continue
    }

    const root = jsxToIR(ctx)
    if (!root) {
      console.error(`Failed to transform ${targetComponentName} to IR`)
      continue
    }

    const ir = buildIR(ctx, root)

    // Generate template
    // For non-default exports, use the default export's name for script registration
    const output = adapter.generate(ir, {
      scriptBaseName: ctx.hasDefaultExport ? undefined : (defaultExportName || undefined)
    })

    // Write individual template file per component
    writeFileSync(resolve(templatesDir, `${targetComponentName}.html.ep`), output.template)
    console.log(`  Template: ${targetComponentName}.html.ep`)

    if (ctx.hasDefaultExport || mainComponentIR === null) {
      mainComponentIR = ir
    }
  }

  // Generate client JS for all components in the file (combined into one file)
  if (mainComponentIR) {
    const clientJsParts: string[] = []
    const allImportNames = new Set<string>()

    for (const targetComponentName of allComponentNames) {
      const ctx = analyzeComponent(source, componentPath, targetComponentName)
      const errors = ctx.errors.filter(e => e.severity === 'error')
      if (errors.length > 0) continue

      const root = jsxToIR(ctx)
      if (!root) continue

      const ir = buildIR(ctx, root)

      let clientJs = generateClientJs(ir, allComponentNames)
      if (clientJs) {
        clientJs = clientJs.replace(
          /from ['"]@barefootjs\/client-runtime['"]/g,
          "from './barefoot.js'"
        )

        // Extract and merge import names
        const importMatch = clientJs.match(/^import \{ ([^}]+) \} from '\.\/barefoot\.js'/)
        if (importMatch) {
          const names = importMatch[1].split(',').map(n => n.trim())
          for (const name of names) allImportNames.add(name)
        }

        const withoutImport = clientJs.replace(/^import .* from '\.\/barefoot\.js'\n\n?/, '')
        clientJsParts.push(withoutImport)
      }
    }

    if (clientJsParts.length > 0) {
      const componentName = componentPath.split('/').pop()?.replace('.tsx', '')
      const sortedImports = [...allImportNames].sort()
      const importStatement = `import { ${sortedImports.join(', ')} } from './barefoot.js'\n\n`
      const clientJsContent = importStatement + clientJsParts.join('\n')
      writeFileSync(resolve(clientDir, `${componentName}.client.js`), clientJsContent)
      console.log(`  Client:   ${componentName}.client.js`)
    }
  }

  console.log(`✓ ${componentPath}`)
}

// Combine parent-child client JS into single files
const clientFiles = readdirSync(clientDir).filter(f => f.endsWith('.client.js'))
const files = new Map<string, string>()
for (const file of clientFiles) {
  const name = file.replace('.client.js', '')
  files.set(name, readFileSync(resolve(clientDir, file), 'utf-8'))
}
const combined = combineParentChildClientJs(files)
for (const [name, content] of combined) {
  writeFileSync(resolve(clientDir, `${name}.client.js`), content)
  console.log(`Combined: client/${name}.client.js`)
}

console.log('\nDone!')
