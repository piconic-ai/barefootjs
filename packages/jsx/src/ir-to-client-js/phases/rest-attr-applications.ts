/**
 * `rest-attr-applications` phase — emit `applyRestAttrs(_v, source, exclude)`
 * for HTML elements with unresolved spread attributes.
 *
 * The runtime helper applies the spread source's enumerable properties as
 * DOM attributes, skipping the keys statically set on the element. In profile
 * mode a 4th argument names the site for turn attribution of the event
 * handlers the spread carries.
 */

import type { ClientJsContext } from '../types.ts'
import { varSlotId } from '../utils.ts'

export function emitRestAttrApplications(lines: string[], ctx: ClientJsContext): void {
  if (ctx.restAttrElements.length === 0) return
  for (const elem of ctx.restAttrElements) {
    const v = varSlotId(elem.slotId)
    const excludeKeys = JSON.stringify(elem.excludeKeys)
    // Profile mode (#3376): hand the runtime this site's handler id prefix so
    // the event handlers it wires from the spread get the same turn markers
    // an explicit `on*` handler gets in `event-handlers.ts`.
    const turnSite = ctx.profile ? `, ${JSON.stringify(`${ctx.componentName}#handler:${elem.slotId}`)}` : ''
    lines.push(`  if (_${v}) applyRestAttrs(_${v}, ${elem.source}, ${excludeKeys}${turnSite})`)
  }
  lines.push('')
}
