// barefoot test --debug <component> — Signal change tracing.
//
// Extends renderToTest() with a signal trace log that shows
// every signal initialization and its effect bindings.
// Works entirely from IR — no browser required.

import { readFileSync } from 'fs'
import type { CliContext } from '../context'
import { resolveComponentSource } from '../lib/resolve-source'

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const componentName = args[0]

  if (!componentName) {
    console.error('Error: Component name required.')
    console.error('Usage: barefoot test --debug <component>')
    process.exit(1)
  }

  const { buildComponentGraph, generateStaticTrace, formatSignalTrace } = await import('@barefootjs/jsx')

  const resolved = resolveComponentSource(componentName, ctx)
  if (!resolved) {
    console.error(`Error: Cannot find component "${componentName}".`)
    process.exit(1)
  }

  const source = readFileSync(resolved.filePath, 'utf-8')
  const graph = buildComponentGraph(source, resolved.filePath, resolved.componentName)

  const trace = generateStaticTrace(graph)

  if (ctx.jsonFlag) {
    console.log(JSON.stringify(trace, null, 2))
  } else {
    console.log(`# ${graph.componentName} — Signal Trace`)
    console.log()
    console.log(formatSignalTrace(trace))
  }
}
