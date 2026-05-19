// bf preview — start preview dev server for visual check.
//
// `preview` is not shipped in the npm distribution of `@barefootjs/cli`.
// The current preview package is a monorepo-internal dev tool (hardcoded
// paths, Hono + Bun-specific `hono/bun`, `bunx unocss` shell-out). A
// publish-ready rewrite is tracked in
// https://github.com/piconic-ai/barefootjs/issues/885.
//
// When the CLI is run from inside the barefootjs monorepo (source tree
// available), we still delegate to the existing preview package.

import { existsSync, readdirSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'
import { resolveScaffoldLayout } from '../lib/scaffold-layout'

function listPreviewableComponents(ctx: CliContext): string[] {
  // Mirror `bf gen preview`'s write location so the lister and the
  // generator agree on where previews live. Pre-fix this hardcoded
  // `ui/components/ui` against `ctx.root` and silently returned [] in
  // every scaffolded app.
  const { writeRoot, componentsBasePath } = resolveScaffoldLayout(ctx)
  const componentsDir = path.join(writeRoot, componentsBasePath)
  if (!existsSync(componentsDir)) return []
  const names: string[] = []
  for (const name of readdirSync(componentsDir)) {
    const previewFile = path.join(componentsDir, name, 'index.preview.tsx')
    if (existsSync(previewFile)) names.push(name)
  }
  return names.sort()
}

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const component = args[0]
  if (!component) {
    const available = listPreviewableComponents(ctx)
    if (ctx.jsonFlag) {
      console.log(JSON.stringify({ previewable: available }, null, 2))
      return
    }
    if (available.length === 0) {
      console.error('No previewable components found.')
      console.error('Generate one with: bf gen preview <component>')
      process.exit(1)
    }
    console.log(`${available.length} previewable component(s):`)
    for (const name of available) console.log(`  ${name}`)
    console.log()
    console.log('Open one with: bf preview <component>')
    return
  }

  let runPreview: ((name: string) => Promise<void>) | null = null
  try {
    // Build the specifier at runtime so the bundler does not statically
    // resolve (and inline) the monorepo-internal preview package.
    const specifier = ['..', '..', '..', 'preview', 'src', 'index'].join('/')
    const mod = (await import(specifier)) as { runPreview: (name: string) => Promise<void> }
    runPreview = mod.runPreview
  } catch {
    // Preview package not available in this distribution.
  }

  if (!runPreview) {
    console.error('bf preview is not available in the npm distribution yet.')
    console.error('Tracking issue: https://github.com/piconic-ai/barefootjs/issues/885')
    console.error('Workaround: run the barefootjs monorepo locally with bun.')
    process.exit(1)
  }

  await runPreview(component)
}
