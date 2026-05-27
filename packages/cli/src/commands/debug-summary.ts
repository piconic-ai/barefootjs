// bf debug summary <component> — Show hydration and size summary.
//
// Compact overview of a component's reactive footprint: signal count,
// memo count, loops, event handlers, dynamic bindings, and hydration status.

import { readFileSync } from 'fs'
import type { CliContext } from '../context'
import { resolveComponentSource } from '../lib/resolve-source'

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const componentName = args[0]

  if (!componentName) {
    console.error('Error: Component name required.')
    console.error('Usage: bf debug summary <component> [--json]')
    process.exit(1)
  }

  const { buildComponentSummary, formatComponentSummary } = await import('@barefootjs/jsx')

  const searched: string[] = []
  const resolved = resolveComponentSource(componentName, ctx, searched)
  if (!resolved) {
    console.error(`Error: Cannot find component "${componentName}".`)
    console.error('Looked in:')
    for (const p of searched) console.error(`  - ${p}`)
    process.exit(1)
  }

  const source = readFileSync(resolved.filePath, 'utf-8')
  const summary = buildComponentSummary(source, resolved.filePath, resolved.componentName)

  if (ctx.jsonFlag) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  console.log(formatComponentSummary(summary))
}
