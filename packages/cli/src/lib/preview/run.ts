// bf preview — compile a component's previews to a CSR bundle. Lives
// inside the CLI so it ships with @barefootjs/cli (no separate package,
// no cross-package source imports).

import { resolve, relative } from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type { CliContext } from '../../context'
import { compile, type CompileResult } from './compile'
import { resolvePreviewAssets } from './assets'
import { PreviewError } from './errors'
import { loadComponent } from '../meta-loader'
import { generatePreview } from '../preview-generate'

export { PreviewError } from './errors'

export interface RunPreviewOptions {
  /** Inject a live-reload script into the page (watch mode). */
  liveReload?: boolean
}

export async function runPreview(
  componentName: string,
  ctx: CliContext,
  opts: RunPreviewOptions = {},
): Promise<CompileResult> {
  const assets = await resolvePreviewAssets(ctx)
  const previewsPath = resolve(assets.srcComponentsDir, componentName, 'index.preview.tsx')

  // 1. Auto-generate the preview file from component meta if missing.
  if (!existsSync(previewsPath)) {
    try {
      const meta = loadComponent(ctx.metaDir, componentName)
      const result = generatePreview(meta)
      writeFileSync(previewsPath, result.code)
      console.log(`Auto-generated preview: ${relative(assets.rootDir, previewsPath)}`)
    } catch {
      throw new PreviewError(
        `Preview file not found and auto-generation failed for "${componentName}".\n` +
        `Run: bf gen preview ${componentName}`,
      )
    }
  }

  // 2. Extract export names (function declarations and const/arrow exports)
  const source = readFileSync(previewsPath, 'utf-8')
  const previewNames = [
    ...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g),
    ...source.matchAll(/export\s+const\s+(\w+)\s*=/g),
  ].map(m => m[1])

  if (previewNames.length === 0) {
    throw new PreviewError('No exported preview functions found in the preview file.')
  }

  console.log(`Found ${previewNames.length} previews: ${previewNames.join(', ')}`)

  // 3. Compile (CSR bundle)
  return compile({ assets, previewsPath, previewNames, componentName, liveReload: opts.liveReload })
}
