// barefoot inspect <component> — Show signal dependency graph from IR.
//
// Analyzes a component's reactive structure without running any code.
// AI agents can use this to understand a component before making changes.

import { readFileSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'
import { resolveComponentSource } from '../lib/resolve-source'

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const componentName = args[0]
  if (!componentName) {
    console.error('Error: Component name required.')
    console.error('Usage: barefoot inspect <component>')
    process.exit(1)
  }

  const { buildComponentGraph, formatComponentGraph, graphToJSON } = await import('@barefootjs/jsx')

  const resolved = resolveComponentSource(componentName, ctx)
  if (!resolved) {
    console.error(`Error: Cannot find component "${componentName}".`)
    console.error('Looked in: ui/components/ui/, and by file path.')
    process.exit(1)
  }

  const source = readFileSync(resolved.filePath, 'utf-8')
  const graph = buildComponentGraph(source, resolved.filePath, resolved.componentName)

  if (ctx.jsonFlag) {
    console.log(JSON.stringify(graphToJSON(graph), null, 2))
  } else {
    console.log(formatComponentGraph(graph))
  }
}
