// bf debug loops <component> — Show loop bindings grouped by source collection.
//
// Lists every .map() loop, its key, and all bindings/handlers inside the
// loop body — useful for understanding per-item reactivity and detecting
// missing/unstable keys.

import { readFileSync } from 'fs'
import type { CliContext } from '../context'
import { resolveComponentSource } from '../lib/resolve-source'

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const componentName = args[0]

  if (!componentName) {
    console.error('Error: Component name required.')
    console.error('Usage: bf debug loops <component> [--json]')
    process.exit(1)
  }

  const { buildLoopSummary, formatLoopSummary } = await import('@barefootjs/jsx')

  const searched: string[] = []
  const resolved = resolveComponentSource(componentName, ctx, searched)
  if (!resolved) {
    console.error(`Error: Cannot find component "${componentName}".`)
    console.error('Looked in:')
    for (const p of searched) console.error(`  - ${p}`)
    process.exit(1)
  }

  const source = readFileSync(resolved.filePath, 'utf-8')
  const summary = buildLoopSummary(source, resolved.filePath, resolved.componentName)

  if (ctx.jsonFlag) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  console.log(formatLoopSummary(summary))
}
