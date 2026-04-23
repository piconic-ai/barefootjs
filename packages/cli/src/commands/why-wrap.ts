// barefoot why-wrap <component> — Surface fallback-wrapped expressions.
//
// Lists every DOM binding whose `createEffect` came from the Solid-style
// wrap-by-default fallback (#937) rather than from statically-proven
// reactivity. These expressions are harmless — the effect runs once at init
// and subscribes to whatever signals it happens to read at runtime, possibly
// none — but they are candidates for optimisation: rewriting as
// `createMemo` or inlining a known-reactive source makes the dependency
// static and lets the emitter skip the fallback wrap entirely.
//
// Output parallels `barefoot why-update`: short human-readable report by
// default, full JSON under `--json`. Exits 0 even when no fallbacks are
// found (an empty list is a useful signal on its own).

import { readFileSync } from 'fs'
import type { CliContext } from '../context'
import { resolveComponentSource } from '../lib/resolve-source'

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const componentName = args[0]

  if (!componentName) {
    console.error('Error: Component name required.')
    console.error('Usage: barefoot why-wrap <component> [--json]')
    process.exit(1)
  }

  const { buildComponentGraph } = await import('@barefootjs/jsx')

  const resolved = resolveComponentSource(componentName, ctx)
  if (!resolved) {
    console.error(`Error: Cannot find component "${componentName}".`)
    process.exit(1)
  }

  const source = readFileSync(resolved.filePath, 'utf-8')
  const graph = buildComponentGraph(source, resolved.filePath, resolved.componentName)
  const fallbacks = graph.domBindings.filter(d => d.classification === 'fallback')

  if (ctx.jsonFlag) {
    console.log(JSON.stringify({
      componentName: graph.componentName,
      sourceFile: graph.sourceFile,
      fallbacks: fallbacks.map(f => ({
        label: f.label,
        slotId: f.slotId,
        deps: f.deps,
        type: f.type,
        classification: f.classification,
        ...(f.expression !== undefined && { expression: f.expression }),
        ...(f.wrapReason !== undefined && { wrapReason: f.wrapReason }),
      })),
    }, null, 2))
    return
  }

  if (fallbacks.length === 0) {
    console.log(`${graph.componentName} — no fallback-wrapped expressions.`)
    return
  }

  console.log(`${graph.componentName} — ${fallbacks.length} fallback-wrapped expression(s)`)
  // Column-align the `~ expression` column so the eye scans down the
  // expressions rather than the labels. Width covers the longest
  // `type "id"` cell across this component's fallbacks.
  const cells = fallbacks.map(f => {
    const id = f.type === 'attribute' ? f.label : f.slotId
    return { f, cell: `${f.type} "${id}"` }
  })
  const width = cells.reduce((w, c) => Math.max(w, c.cell.length), 0)
  for (const { f, cell } of cells) {
    const expr = f.expression ?? '(expression not captured)'
    // Reason is appended at EOL so the `~ expression` column stays aligned
    // for the eye-scan case; debuggers who care about *why* the wrap fired
    // can read the bracketed tag on the right.
    const reason = f.wrapReason ? `  [${f.wrapReason}]` : ''
    console.log(`  ${cell.padEnd(width)}  ~ ${expr}${reason}`)
  }
  console.log()
  console.log('Fallback wraps run one createEffect per expression. Each subscribes to')
  console.log('whatever signals it happens to read at runtime (possibly none).')
  console.log('Rewrite the expression as a createMemo to make the dependency static,')
  console.log('or inline a known-reactive source so the emitter can prove it.')
}
