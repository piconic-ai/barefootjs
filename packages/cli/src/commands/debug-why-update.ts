// bf debug why-update <component> <binding> — Explain why a binding updates.
//
// Reverse lookup: given a DOM binding label (attribute name, slot ID, or
// component.prop), trace back through signals/memos to the event handlers
// that trigger the update.

import { readFileSync } from 'fs'
import type { CliContext } from '../context'
import { resolveComponentSource } from '../lib/resolve-source'

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const componentName = args[0]
  const bindingLabel = args[1]

  if (!componentName || !bindingLabel) {
    console.error('Error: Component name and binding label required.')
    console.error('Usage: bf debug why-update <component> <binding> [--json]')
    console.error('  binding: attribute name (e.g. "style"), slot ID (e.g. "s0"),')
    console.error('           or component prop (e.g. "Button.disabled")')
    process.exit(1)
  }

  const { buildWhyUpdate, formatWhyUpdate, buildComponentGraph } = await import('@barefootjs/jsx')

  const searched: string[] = []
  const resolved = resolveComponentSource(componentName, ctx, searched)
  if (!resolved) {
    console.error(`Error: Cannot find component "${componentName}".`)
    console.error('Looked in:')
    for (const p of searched) console.error(`  - ${p}`)
    process.exit(1)
  }

  const source = readFileSync(resolved.filePath, 'utf-8')
  const result = buildWhyUpdate(source, resolved.filePath, bindingLabel, resolved.componentName)

  if (!result) {
    const graph = buildComponentGraph(source, resolved.filePath, resolved.componentName)
    console.error(`Error: Binding "${bindingLabel}" not found in ${graph.componentName}.`)
    const available = graph.domBindings.map(d =>
      d.type === 'attribute' ? d.label : d.slotId,
    )
    if (available.length > 0) {
      console.error(`Available bindings: ${[...new Set(available)].join(', ')}`)
    }
    process.exit(1)
  }

  if (result.ambiguous) {
    console.error(`Error: "${bindingLabel}" matches multiple bindings. Disambiguate with a slot ID:`)
    for (const m of result.ambiguous) {
      console.error(`  ${m.slotId} (${m.label})`)
    }
    process.exit(1)
  }

  if (ctx.jsonFlag) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  console.log(formatWhyUpdate(result))
}
