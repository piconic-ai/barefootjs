/**
 * `props-event-handlers` phase — alias prop event handlers as locals.
 *
 * For every event handler name referenced anywhere reachable from the
 * init body, if that name is a prop (and not already a local
 * function / constant or destructured prop), emit
 * `const handlerName = _p.handlerName`. Subsequent emission can call
 * `handlerName(...)` without writing the prop accessor inline.
 */

import type { ClientJsContext } from '../types'
import { PROPS_PARAM } from '../utils'

export function emitPropsEventHandlers(
  lines: string[],
  ctx: ClientJsContext,
  usedFunctions: Set<string>,
  neededProps: Set<string>,
): void {
  const localNames = new Set<string>([
    ...ctx.localFunctions.map(f => f.name),
    ...ctx.localConstants.map(c => c.name),
  ])
  let addedAny = false
  for (const handlerName of usedFunctions) {
    if (localNames.has(handlerName)) continue
    if (neededProps.has(handlerName)) continue
    const isProp = ctx.propsParams.some(p => p.name === handlerName)
    if (!isProp) continue
    lines.push(`  const ${handlerName} = ${PROPS_PARAM}.${handlerName}`)
    addedAny = true
  }
  if (addedAny) lines.push('')
}
