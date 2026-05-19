// bf gen test — generate IR test from existing component source.

import type { CliContext } from '../context'
import { resolveComponentSource } from '../lib/resolve-source'
import { generateTestTemplate } from '../lib/test-template'

export function run(args: string[], ctx: CliContext): void {
  const componentName = args[0]
  if (!componentName) {
    console.error('Error: Component name required. Usage: bf gen test <component>')
    process.exit(1)
  }

  const searched: string[] = []
  const resolved = resolveComponentSource(componentName, ctx, searched)
  if (!resolved) {
    console.error(`Error: Cannot find component "${componentName}".`)
    console.error('Looked in:')
    for (const p of searched) console.error(`  - ${p}`)
    process.exit(1)
  }
  console.log(generateTestTemplate(resolved.filePath))
}
