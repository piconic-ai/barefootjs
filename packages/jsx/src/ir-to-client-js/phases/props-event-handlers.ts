/**
 * `props-event-handlers` phase — alias prop event handlers as locals.
 *
 * For every event handler name referenced anywhere reachable from the
 * init body, if that name is a prop (and not already a local
 * function / constant or destructured prop), emit
 * `const handlerName = _p.handlerName`. Subsequent emission can call
 * `handlerName(...)` without writing the prop accessor inline.
 *
 * Only for props-object mode, where a bare `handlerName` would otherwise be
 * a `ReferenceError`. In destructured mode `rewriteDestructuredPropReads`
 * already turns every handler-name read into a live `_p.handlerName`, so the
 * alias would only be emitted to be left unused.
 */

import type { ClientJsContext } from '../types.ts'
import { PROPS_PARAM } from '../utils.ts'

export function emitPropsEventHandlers(
  lines: string[],
  ctx: ClientJsContext,
  usedFunctions: Set<string>,
  neededProps: Set<string>,
): void {
  if (ctx.propsObjectName === null) return
  const localNames = new Set<string>([
    ...ctx.localFunctions.map(f => f.name),
    ...ctx.localConstants.map(c => c.name),
  ])
  let addedAny = false
  for (const handlerName of usedFunctions) {
    if (localNames.has(handlerName)) continue
    if (neededProps.has(handlerName)) continue
    const prop = ctx.propsParams.find(p => p.name === handlerName)
    if (!prop) continue
    // `_p` is always keyed by the caller-facing name (#2524 CSR half).
    lines.push(`  const ${handlerName} = ${PROPS_PARAM}.${prop.sourceName ?? handlerName}`)
    addedAny = true
  }
  if (addedAny) lines.push('')
}
