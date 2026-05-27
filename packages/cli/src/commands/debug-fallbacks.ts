// bf debug fallbacks <component> — Surface fallback-wrapped expressions.
//
// Lists every DOM binding whose `createEffect` came from the Solid-style
// wrap-by-default fallback (#937) rather than from statically-proven
// reactivity. Each entry shows source location, expression, human-readable
// reason, runtime dependency analysis, and a suggestion for resolution.

import { readFileSync } from 'fs'
import type { CliContext } from '../context'
import { resolveComponentSource } from '../lib/resolve-source'

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const componentName = args[0]

  if (!componentName) {
    console.error('Error: Component name required.')
    console.error('Usage: bf debug fallbacks <component> [--json]')
    process.exit(1)
  }

  const { buildComponentGraph, describeFallback, formatFallbackExplanations } = await import('@barefootjs/jsx')

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
  const isEventHandlerProp = (d: { type: string; label: string }) =>
    d.type === 'attribute' && /^on[A-Z]/.test(d.label.split('.').pop() ?? '')
  const fallbacks = graph.domBindings.filter(d => d.classification === 'fallback' && !isEventHandlerProp(d))

  if (ctx.jsonFlag) {
    console.log(JSON.stringify({
      componentName: graph.componentName,
      sourceFile: graph.sourceFile,
      fallbacks: fallbacks.map(f => {
        const ex = describeFallback(f)
        return {
          label: f.label,
          slotId: f.slotId,
          deps: f.deps,
          type: f.type,
          classification: f.classification,
          ...(f.expression !== undefined && { expression: f.expression }),
          ...(f.wrapReason !== undefined && { wrapReason: f.wrapReason }),
          reason: ex.reason,
          runtimeDeps: ex.runtimeDeps,
          suggestion: ex.suggestion,
          isEventHandler: ex.isEventHandler,
          ...(ex.loc && { loc: ex.loc }),
        }
      }),
    }, null, 2))
    return
  }

  console.log(formatFallbackExplanations(graph.componentName, fallbacks))
}
