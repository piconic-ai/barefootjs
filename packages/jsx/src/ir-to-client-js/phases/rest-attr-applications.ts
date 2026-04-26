/**
 * `rest-attr-applications` phase — emit `applyRestAttrs(_v, source, exclude)`
 * for HTML elements with unresolved spread attributes.
 *
 * The runtime helper applies the spread source's enumerable properties as
 * DOM attributes, skipping the keys statically set on the element.
 */

import type { ClientJsContext } from '../types'
import { varSlotId } from '../utils'

export function emitRestAttrApplications(lines: string[], ctx: ClientJsContext): void {
  if (ctx.restAttrElements.length === 0) return
  for (const elem of ctx.restAttrElements) {
    const v = varSlotId(elem.slotId)
    const excludeKeys = JSON.stringify(elem.excludeKeys)
    lines.push(`  if (_${v}) applyRestAttrs(_${v}, ${elem.source}, ${excludeKeys})`)
  }
  lines.push('')
}
