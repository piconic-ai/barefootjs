/**
 * `provider-and-child-inits` phase — emit `provideContext(...)` calls
 * for context providers, then `initChild(...)` calls for direct child
 * components (non-loop, non-conditional).
 *
 * Each section is preceded by a blank line + comment header so the
 * generated init body stays readable.
 *
 * Must run before `loop-updates` (encoded as `dependsOn` in `phases.ts`)
 * so context providers are in scope when loop children call
 * `useContext()`.
 */

import type { ClientJsContext } from '../types'
import { varSlotId } from '../utils'

export function emitProviderAndChildInits(lines: string[], ctx: ClientJsContext): void {
  if (ctx.providerSetups.length > 0) {
    lines.push('')
    lines.push('  // Provide context for child components')
    for (const provider of ctx.providerSetups) {
      lines.push(`  provideContext(${provider.contextName}, ${provider.valueExpr})`)
    }
  }

  if (ctx.childInits.length > 0) {
    lines.push('')
    lines.push(`  // Initialize child components with props`)
    for (const child of ctx.childInits) {
      const scopeRef = child.slotId ? `_${varSlotId(child.slotId)}` : '__scope'
      lines.push(`  initChild('${child.name}', ${scopeRef}, ${child.propsExpr})`)
    }
  }
}
