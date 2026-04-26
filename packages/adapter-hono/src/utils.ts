import { raw } from 'hono/html'

/**
 * Output HTML comment marker for conditional reconciliation.
 * Same signature as Go template bfComment function.
 */
export function bfComment(key: string) {
  return raw(`<!--bf-${key}-->`)
}

/**
 * Output opening comment marker for reactive text expressions.
 * Renders <!--bf:slotId-->
 */
export function bfText(slotId: string) {
  return raw(`<!--bf:${slotId}-->`)
}

/**
 * Output closing comment marker for reactive text expressions.
 * Renders <!--/-->
 */
export function bfTextEnd() {
  return raw('<!--/-->')
}

