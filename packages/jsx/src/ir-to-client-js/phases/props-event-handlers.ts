/**
 * `props-event-handlers` phase — alias prop event handlers as locals.
 *
 * For every event handler name referenced anywhere reachable from the
 * init body, if that name is a prop (and not already a local
 * function / constant or destructured prop), emit
 * `const handlerName = _p.handlerName`. Subsequent emission can call
 * `handlerName(...)` without writing the prop accessor inline.
 *
 * Destructured-props mode (`ctx.propsObjectName === null`) is skipped
 * entirely (Move B, #2760's follow-up): `rewriteDestructuredPropReads`
 * (`generate-init.ts`) already rewrites every bare handler-name read in
 * the finished init body to a live `_p.handlerName` call, so this alias
 * would be dead weight — and worse than dead. A surviving `const
 * handlerName = ...` at init-body top level lands in the init `Block`
 * scope frame that pass's binding walk tracks (`prop-rewrite.ts`'s
 * `scopeFrameOf`), which would then treat every `handlerName` reference
 * as SHADOWED by this very alias and silently skip rewriting it —
 * reinstating the captured-once bug this alias was written to route
 * around. Props-object mode (`propsObjectName != null`) still needs this
 * phase: there `handlerName` is never `_p`-prefixed automatically, so a
 * bare reference would otherwise be a `ReferenceError`.
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
