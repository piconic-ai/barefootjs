/**
 * Build script for Mojolicious EP template example
 *
 * Compiles JSX components to .html.ep template files + client JS.
 */

import { compileJSXSync, combineParentChildClientJs } from '@barefootjs/jsx'
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
// TODO: Add child-component examples (Toggle, TodoApp, Portal) once
// bf->render_child is integrated with Mojolicious's include system
const components = [
  '../shared/components/Counter.tsx',
  '../shared/components/Form.tsx',
  '../shared/components/ConditionalReturn.tsx',
]

const adapter = new MojoAdapter({
  clientJsBasePath: '/client/',
  barefootJsPath: '/client/barefoot.js',
})

console.log('Building Mojolicious EP templates...\n')

for (const componentPath of components) {
  const fullPath = resolve(projectRoot, componentPath)
  const source = readFileSync(fullPath, 'utf-8')

  const result = compileJSXSync(source, fullPath, { adapter })

  const warnings = result.errors.filter(e => e.severity === 'warning')
  const errors = result.errors.filter(e => e.severity === 'error')

  if (warnings.length > 0) {
    for (const w of warnings) console.warn(`  ⚠ ${w.message}`)
  }
  if (errors.length > 0) {
    console.error(`Errors compiling ${componentPath}:`)
    for (const e of errors) console.error(`  ${e.message}`)
    continue
  }

  // Write template
  const templateFile = result.files.find(f => f.type === 'markedTemplate')
  if (templateFile) {
    const name = componentPath.split('/').pop()?.replace('.tsx', '.html.ep')
    writeFileSync(resolve(templatesDir, name!), templateFile.content)
    console.log(`  Template: ${name}`)
  }

  // Write client JS
  const clientJsFile = result.files.find(f => f.type === 'clientJs')
  if (clientJsFile) {
    const name = componentPath.split('/').pop()?.replace('.tsx', '.client.js')
    let content = clientJsFile.content
    content = content.replace(
      /from ['"]@barefootjs\/client-runtime['"]/g,
      "from './barefoot.js'"
    )
    writeFileSync(resolve(clientDir, name!), content)
    console.log(`  Client:   ${name}`)
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
