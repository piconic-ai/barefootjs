// barefoot why-update <component> <signal> — Show update propagation path.
//
// Reverse-lookup: "why does this DOM node update?"
// Shows every signal, memo, effect, and DOM binding in the propagation chain.

import { readFileSync } from 'fs'
import type { CliContext } from '../context'
import { resolveComponentSource } from '../lib/resolve-source'

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const componentName = args[0]
  const targetName = args[1]

  if (!componentName || !targetName) {
    console.error('Error: Component name and signal/memo name required.')
    console.error('Usage: barefoot why-update <component> <signal|memo>')
    process.exit(1)
  }

  const { buildComponentGraph, traceUpdatePath, formatUpdatePath } = await import('@barefootjs/jsx')

  const resolved = resolveComponentSource(componentName, ctx)
  if (!resolved) {
    console.error(`Error: Cannot find component "${componentName}".`)
    process.exit(1)
  }

  const source = readFileSync(resolved.filePath, 'utf-8')
  const graph = buildComponentGraph(source, resolved.filePath, resolved.componentName)
  const path = traceUpdatePath(graph, targetName)

  if (!path) {
    console.error(`Error: Signal or memo "${targetName}" not found in ${graph.componentName}.`)
    const available = [
      ...graph.signals.map(s => s.name),
      ...graph.memos.map(m => m.name),
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
