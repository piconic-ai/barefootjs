// bf gen preview — generate preview file from component metadata.

import { existsSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'
import { loadComponent } from '../lib/meta-loader'
import { generatePreview } from '../lib/preview-generate'
import { resolveScaffoldLayout } from '../lib/scaffold-layout'

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const force = args.includes('--force')
  const name = args.find(a => !a.startsWith('--'))

  if (!name) {
    console.error('Usage: bf gen preview <component> [--force]')
    process.exit(1)
  }

  const meta = loadComponent(ctx.metaDir, name)
  const { writeRoot, componentsBasePath } = resolveScaffoldLayout(ctx)
  const result = generatePreview(meta, componentsBasePath)
  const absPath = path.join(writeRoot, result.filePath)

  if (existsSync(absPath) && !force) {
    console.error(`Error: ${result.filePath} already exists. Use --force to overwrite.`)
    process.exit(1)
  }

  const dir = path.dirname(absPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(absPath, result.code)
  console.log(`Generated ${result.filePath}`)
  console.log(`Previews: ${result.previewNames.join(', ')}`)
}
