/**
 * Build script for Go html/template example
 *
 * Compiles JSX components to Go html/template files.
 */

import { analyzeComponent, listExportedComponents, jsxToIR, generateClientJs, combineParentChildClientJs, type ComponentIR } from '@barefootjs/jsx'
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import config from './barefoot.config'


const projectRoot = import.meta.dirname

// Component files to compile (from shared directory)
const components = [
  '../shared/components/Counter.tsx',
  '../shared/components/Toggle.tsx',
  '../shared/components/TodoItem.tsx',
  '../shared/components/TodoApp.tsx',
  '../shared/components/TodoAppSSR.tsx',
  '../shared/components/ReactiveProps.tsx',
  '../shared/components/Form.tsx',
  '../shared/components/PortalExample.tsx',
  '../shared/components/ConditionalReturn.tsx',
]

// Output directories
const outputDir = resolve(projectRoot, 'dist')
const templatesDir = resolve(outputDir, 'templates')
const clientDir = resolve(outputDir, 'client')

// DOM package path
const domPkgDir = resolve(projectRoot, '../../packages/client-runtime')
const domDistFile = resolve(domPkgDir, 'dist/index.js')

// Create output directories
mkdirSync(templatesDir, { recursive: true })
mkdirSync(clientDir, { recursive: true })

// Build and copy barefoot.js from @barefootjs/client-runtime
console.log('Preparing @barefootjs/client-runtime runtime...')
if (!existsSync(domDistFile)) {
  console.log('  Building @barefootjs/client-runtime...')
  spawnSync('bun', ['run', 'build'], { cwd: domPkgDir, stdio: 'inherit' })
}
const barefootDest = resolve(clientDir, 'barefoot.js')
copyFileSync(domDistFile, barefootDest)
console.log('  Copied: barefoot.js\n')

// Use adapter from barefoot.config.ts
const adapter = config.adapter

// Collect all types for combined components.go
const allTypeParts: string[] = []

console.log('Building Go html/template files...\n')

for (const componentPath of components) {
  const fullPath = resolve(projectRoot, componentPath)
  const source = readFileSync(fullPath, 'utf-8')

  // Find all component functions in the file
  const allComponentNames = listExportedComponents(source, componentPath)

  // Generate templates for all components in the file
  const templateParts: string[] = []
  const typeParts: string[] = []
  let mainComponentIR: ComponentIR | null = null

  // Find the default export component name (used as scriptBaseName for non-default exports)
  let defaultExportName: string | null = null
  for (const name of allComponentNames) {
    const ctx = analyzeComponent(source, componentPath, name)
    if (ctx.hasDefaultExport) {
      defaultExportName = name
      break
    }
  }

  for (const targetComponentName of allComponentNames) {
    // Analyze each component
    const ctx = analyzeComponent(source, componentPath, targetComponentName)

    // Separate errors and warnings
    const errors = ctx.errors.filter(e => e.severity === 'error')
    const warnings = ctx.errors.filter(e => e.severity === 'warning')

    // Show warnings but continue
    if (warnings.length > 0) {
      console.warn(`Warnings compiling ${targetComponentName} in ${componentPath}:`)
      for (const warning of warnings) {
        console.warn(`  ${warning.message}`)
      }
    }

    // Only skip on actual errors
    if (errors.length > 0) {
      console.error(`Errors compiling ${targetComponentName} in ${componentPath}:`)
      for (const error of errors) {
        console.error(`  ${error.message}`)
      }
      continue
    }

    const root = jsxToIR(ctx)
    if (!root) {
      console.error(`Failed to transform ${targetComponentName} to IR`)
      continue
    }

    // Build ComponentIR
    const ir: ComponentIR = {
      version: '0.1',
      metadata: {
        componentName: ctx.componentName!,
        hasDefaultExport: ctx.hasDefaultExport,
        typeDefinitions: ctx.typeDefinitions,
        propsType: ctx.propsType,
        propsParams: ctx.propsParams,
        restPropsName: ctx.restPropsName,
        propsObjectName: ctx.propsObjectName,
        signals: ctx.signals,
        memos: ctx.memos,
        effects: ctx.effects,
        onMounts: ctx.onMounts,
        imports: ctx.imports,
        localFunctions: ctx.localFunctions,
        localConstants: ctx.localConstants,
      },
      root,
      errors: [],
    }

    // Generate template
    // For non-default exports, use the default export's name for script registration
    // (all components in a file share the same .client.js file named after the default export)
    const output = adapter.generate(ir, {
      scriptBaseName: ctx.hasDefaultExport ? undefined : (defaultExportName || undefined)
    })
    templateParts.push(output.template)

    // Collect types for allTypeParts (will be combined later)
    if (output.types) {
      // Extract everything after package declaration and imports (keep only types)
      const lines = output.types.split('\n')
      const packageEnd = lines.findIndex(l => l.startsWith('package '))
      if (packageEnd >= 0) {
        // Skip package line, empty lines, and import block
        let startLine = packageEnd + 1
        let inImportBlock = false

        while (startLine < lines.length) {
          const line = lines[startLine]
          const trimmedLine = line?.trim() ?? ''

          // Skip empty lines
          if (trimmedLine === '') {
            startLine++
            continue
          }

          // Handle single-line import: import "foo"
          if (trimmedLine.startsWith('import ') && !trimmedLine.includes('(')) {
            startLine++
            continue
          }

          // Handle multi-line import block: import (
          if (trimmedLine.startsWith('import (')) {
            inImportBlock = true
            startLine++
            continue
          }

          // Inside import block, skip until closing )
          if (inImportBlock) {
            if (trimmedLine === ')') {
              inImportBlock = false
            }
            startLine++
            continue
          }

          // Found a non-import, non-empty line - this is where types start
          break
        }

        const typesContent = lines.slice(startLine).join('\n').trim()
        if (typesContent) {
          typeParts.push(typesContent)
          allTypeParts.push(typesContent)
        }
      }
    }

    // Keep track of the main (default exported) component for client JS
    if (ctx.hasDefaultExport) {
      mainComponentIR = ir
    }
  }

  if (templateParts.length === 0) {
    console.error(`No components found in ${componentPath}`)
    continue
  }

  // Write combined template file
  const templateFileName = componentPath.split('/').pop()?.replace('.tsx', adapter.extension)
  const templatePath = resolve(templatesDir, templateFileName!)
  mkdirSync(dirname(templatePath), { recursive: true })
  writeFileSync(templatePath, templateParts.join('\n'))
  console.log(`  Template: ${templateFileName}`)

  // Generate client JS for the main component (default export) and any local components
  if (mainComponentIR) {
    // Combine all component client JS into one file
    const clientJsParts: string[] = []
    const allImportNames = new Set<string>()

    for (const targetComponentName of allComponentNames) {
      const ctx = analyzeComponent(source, componentPath, targetComponentName)
      // Skip only on actual errors (not warnings)
      const errors = ctx.errors.filter(e => e.severity === 'error')
      if (errors.length > 0) continue

      const root = jsxToIR(ctx)
      if (!root) continue

      const ir: ComponentIR = {
        version: '0.1',
        metadata: {
          componentName: ctx.componentName!,
          hasDefaultExport: ctx.hasDefaultExport,
          typeDefinitions: ctx.typeDefinitions,
          propsType: ctx.propsType,
          propsParams: ctx.propsParams,
          restPropsName: ctx.restPropsName,
          propsObjectName: ctx.propsObjectName,
          signals: ctx.signals,
          memos: ctx.memos,
          effects: ctx.effects,
          onMounts: ctx.onMounts,
          imports: ctx.imports,
          localFunctions: ctx.localFunctions,
          localConstants: ctx.localConstants,
        },
        root,
        errors: [],
      }

      let clientJs = generateClientJs(ir, allComponentNames)
      if (clientJs) {
        // Replace @barefootjs/client-runtime import with relative path to barefoot.js
        clientJs = clientJs.replace(
          /from ['"]@barefootjs\/client-runtime['"]/g,
          "from './barefoot.js'"
        )

        // Extract and merge import names from all components
        const importMatch = clientJs.match(/^import \{ ([^}]+) \} from '\.\/barefoot\.js'/)
        if (importMatch) {
          const names = importMatch[1].split(',').map(n => n.trim())
          for (const name of names) {
            allImportNames.add(name)
          }
        }

        // Remove import statement (will add merged import at the beginning)
        const withoutImport = clientJs.replace(/^import .* from '\.\/barefoot\.js'\n\n?/, '')
        clientJsParts.push(withoutImport)
      }
    }

    if (clientJsParts.length > 0) {
      const componentName = componentPath.split('/').pop()?.replace('.tsx', '')
      const clientPath = resolve(clientDir, `${componentName}.client.js`)
      // Generate merged import statement with sorted names
      const sortedImports = [...allImportNames].sort()
      const importStatement = `import { ${sortedImports.join(', ')} } from './barefoot.js'\n\n`
      const clientJsContent = importStatement + clientJsParts.join('\n')
      writeFileSync(clientPath, clientJsContent)
      console.log(`  Client:   ${componentName}.client.js`)
    }
  }

  console.log(`✓ ${componentPath}`)
}

// Write combined components.go with all types
if (allTypeParts.length > 0) {
  console.log('\nGenerating components.go...')

  // Combine all parts and deduplicate
  let combinedContent = allTypeParts.join('\n\n')

  // Deduplicate Input/Props types and NewXxxProps functions (keep the first occurrence)
  const seenDefinitions = new Set<string>()

  // Deduplicate type definitions
  const typeRegex = /\/\/ \w+ is .*\ntype (\w+) struct\s*\{[^}]*\}/g
  combinedContent = combinedContent.replace(typeRegex, (match, typeName) => {
    if (seenDefinitions.has(`type:${typeName}`)) {
      return '' // Remove duplicate
    }
    seenDefinitions.add(`type:${typeName}`)
    return match
  })

  // Deduplicate NewXxxProps functions
  const funcRegex = /\/\/ (New\w+Props) creates .*\nfunc \1\([^)]*\) \w+ \{[\s\S]*?\n\}/g
  combinedContent = combinedContent.replace(funcRegex, (match, funcName) => {
    if (seenDefinitions.has(`func:${funcName}`)) {
      return '' // Remove duplicate
    }
    seenDefinitions.add(`func:${funcName}`)
    return match
  })

  // Clean up multiple empty lines
  combinedContent = combinedContent.replace(/\n{3,}/g, '\n\n').trim()

  // Manual types that cannot be auto-generated from components
  // These are application-specific types used by TodoApp
  const manualTypes = `
// =============================================================================
// Manual Types (application-specific, not generated from components)
// =============================================================================

// Todo represents a single todo item.
type Todo struct {
	ID      int    \`json:"id"\`
	Text    string \`json:"text"\`
	Done    bool   \`json:"done"\`
	Editing bool   \`json:"editing"\`
}
`

  // Post-process: Fix types to use Todo instead of interface{}
  // Order matters: fix individual fields first, then add extra fields to TodoAppProps

  // 1. Fix TodoItemInput: Todo interface{} -> Todo Todo
  combinedContent = combinedContent.replace(
    /(\tTodo) interface\{\}(\n)/g,
    '$1 Todo$2'
  )

  // 2. Fix TodoItemProps: Todo interface{} `json:"todo"` -> Todo Todo `json:"todo"`
  combinedContent = combinedContent.replace(
    /(\tTodo) interface\{\} (`json:"todo"`)/g,
    '$1 Todo $2'
  )

  // 3. Fix TodoAppInput: InitialTodos interface{} -> InitialTodos []Todo
  combinedContent = combinedContent.replace(
    /(InitialTodos) \[\]interface\{\}(\n)/g,
    '$1 []Todo$2'
  )

  // 4. Fix TodoAppProps: InitialTodos []interface{} `json:...` -> InitialTodos []Todo `json:...`
  combinedContent = combinedContent.replace(
    /(InitialTodos) \[\]interface\{\} (`json:"initialTodos"`)/g,
    '$1 []Todo $2'
  )

  // 5. Fix TodoAppProps: Todos []interface{} -> Todos []Todo
  combinedContent = combinedContent.replace(
    /(\tTodos) \[\]interface\{\} (`json:"todos"`)/g,
    '$1 []Todo $2'
  )

  // 6. Add extra fields to TodoAppProps (before closing brace)
  // Find the closing brace of TodoAppProps and insert fields before it
  combinedContent = combinedContent.replace(
    /(type TodoAppProps struct \{[\s\S]*?)(^\})/m,
    `$1	TodoItems    []TodoItemProps  \`json:"-"\`         // For Go template (not in JSON)
	DoneCount    int              \`json:"doneCount"\` // Pre-computed done count
$2`
  )

  // 7. Fix TodoAppSSRProps and TodoAppProps: Filter interface{} -> Filter string
  combinedContent = combinedContent.replace(
    /(Filter) interface\{\} (`json:"filter"`)/g,
    '$1 string $2'
  )

  // 7b. Fix Filter initial value: nil -> ""
  combinedContent = combinedContent.replace(
    /Filter: nil,/g,
    'Filter: "all",'
  )

  // 8. Add extra fields to TodoAppSSRProps (before closing brace)
  combinedContent = combinedContent.replace(
    /(type TodoAppSSRProps struct \{[\s\S]*?)(^\})/m,
    `$1	TodoItems    []TodoItemProps  \`json:"-"\`         // For Go template (not in JSON)
	DoneCount    int              \`json:"doneCount"\` // Pre-computed done count
$2`
  )

  // 9. Fix DestructuredStyleChildInput: Value and Label should be int/string, not interface{}
  combinedContent = combinedContent.replace(
    /type DestructuredStyleChildInput struct \{[\s\S]*?Value interface\{\}[\s\S]*?Label interface\{\}[\s\S]*?\}/,
    `type DestructuredStyleChildInput struct {
	ScopeID string // Optional: if empty, random ID is generated
	Value int
	Label string
}`
  )

  // 10. Fix DestructuredStyleChildProps: Value and Label types
  combinedContent = combinedContent.replace(
    /(type DestructuredStyleChildProps struct \{[\s\S]*?)Value interface\{\} (`json:"value"`)[\s\S]*?Label interface\{\} (`json:"label"`)/,
    '$1Value int $2\n\tLabel string $3'
  )

  const componentsGoContent = `// Code generated by BarefootJS. DO NOT EDIT.
package main

import (
	"math/rand"

	bf "github.com/barefootjs/runtime/bf"
)

// randomID generates a random string of length n for ScopeID.
func randomID(n int) string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}
${manualTypes}
${combinedContent}
`
  writeFileSync(resolve(projectRoot, 'components.go'), componentsGoContent)
  console.log('✓ components.go')
}

// Combine parent-child client JS into single files
function combineClientJsFiles(): void {
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
}

// Combine parent-child client JS
combineClientJsFiles()

// Minify client JS (after combine so all files are final)
if (config.minify) {
  // @ts-expect-error minifySyntax is supported at runtime but missing from older bun-types
  const transpiler = new Bun.Transpiler({ loader: 'js', minifyWhitespace: true, minifySyntax: true })
  const clientFiles = readdirSync(clientDir).filter(f => f.endsWith('.js'))
  for (const file of clientFiles) {
    const filePath = resolve(clientDir, file)
    const content = readFileSync(filePath, 'utf-8')
    if (content) {
      writeFileSync(filePath, transpiler.transformSync(content))
    }
  }
}

console.log('\nDone!')
