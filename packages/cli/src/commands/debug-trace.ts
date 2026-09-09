// bf debug trace <component> <signal|memo|prop> — Show update propagation path.
//
// Reverse-lookup: "why does this DOM node update?"
// Shows every signal, memo, effect, and DOM binding in the propagation chain.
// A prop is named as `bf debug graph` spells it: `title` (destructured) or
// `props.value` (props-object member) — #2903.

import { readFileSync } from 'fs'
import type { CliContext } from '../context'
import { resolveComponentSource } from '../lib/resolve-source'

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const componentName = args[0]
  const targetName = args[1]

  if (!componentName || !targetName) {
    console.error('Error: Component name and signal/memo/prop name required.')
    console.error('Usage: bf debug trace <component> <signal|memo|prop>')
    process.exit(1)
  }

  const { buildComponentGraph, traceUpdatePath, formatUpdatePath } = await import('@barefootjs/jsx')

  const searched: string[] = []
  const resolved = resolveComponentSource(componentName, ctx, searched)
  if (!resolved) {
    console.error(`Error: Cannot find component "${componentName}".`)
    console.error('Looked in:')
    for (const p of searched) console.error(`  - ${p}`)
    process.exit(1)
  }

  const source = readFileSync(resolved.filePath, 'utf-8')
  const graph = buildComponentGraph(source, resolved.filePath, resolved.componentName)
  const path = traceUpdatePath(graph, targetName)

  if (!path) {
    console.error(`Error: Signal, memo, or prop "${targetName}" not found in ${graph.componentName}.`)
    const available = [
      ...graph.signals.map(s => s.name),
      ...graph.memos.map(m => m.name),
      ...graph.props.map(p => p.name),
    ]
    if (available.length > 0) {
      console.error(`Available: ${available.join(', ')}`)
    }
    process.exit(1)
  }

  if (ctx.jsonFlag) {
    console.log(JSON.stringify(path, null, 2))
  } else {
    console.log(formatUpdatePath(path))
  }
}
