// barefoot preview <component>
//
// Entry point: find previews, compile (CSR bundle), serve static files.

import { resolve } from 'node:path'
import { writeFileSync } from 'node:fs'
import { compile } from './compile'
import { startServer } from './server'

const ROOT_DIR = resolve(import.meta.dir, '../../..')
const UI_DIR = resolve(ROOT_DIR, 'ui/components/ui')
const META_DIR = resolve(ROOT_DIR, 'ui/meta')
const DEFAULT_PORT = 3003

export async function runPreview(componentName: string) {
  const previewsPath = resolve(UI_DIR, componentName, 'index.preview.tsx')

  // 1. Auto-generate preview if file doesn't exist
  if (!await Bun.file(previewsPath).exists()) {
    const { loadComponent } = await import('../../cli/src/lib/meta-loader')
    const { generatePreview } = await import('../../cli/src/lib/preview-generate')

    try {
      const meta = loadComponent(META_DIR, componentName)
      const result = generatePreview(meta)
      writeFileSync(previewsPath, result.code)
      console.log(`Auto-generated preview: ui/components/ui/${componentName}/index.preview.tsx`)
    } catch {
      console.error(`Error: Preview file not found and auto-generation failed for "${componentName}".`)
      console.error(`Run: bf gen preview ${componentName}`)
      process.exit(1)
    }
  }

  // 2. Extract export function names from source
  const source = await Bun.file(previewsPath).text()
  const previewNames = [...source.matchAll(/export function (\w+)/g)].map(m => m[1])

  if (previewNames.length === 0) {
    console.error('Error: No exported functions found in previews file.')
    process.exit(1)
  }

  console.log(`Found ${previewNames.length} previews: ${previewNames.join(', ')}`)

  // 3. Compile (CSR bundle)
  console.log('\nCompiling...')
  const result = await compile({ previewsPath, previewNames, componentName })

  // 4. Start static file server
  startServer(result.distDir, DEFAULT_PORT)
}

// Run if called directly
if (import.meta.main) {
  const componentArg = process.argv[2]
  if (componentArg) {
    runPreview(componentArg)
  } else {
    console.error('Usage: bun run packages/preview/src/index.tsx <component>')
    process.exit(1)
  }
}
