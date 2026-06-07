/**
 * Shared helpers for emitting `addEventListener` lines.
 *
 * Three legacy emission sites all built the same shape by hand:
 *   1. branch arm bindings    (`stringify/insert.ts::emitArmBody`)
 *   2. inline event setup     (`emit-control-flow.ts::emitEventSetup`)
 *   3. loop-cond branch bindings (`stringify/loop-child-arm.ts::stringifyBranchEventBindings`)
 *
 * Each repeated `wrapHandlerInBlock(handler)` + DOM-event-name normalisation +
 * `if (elem) elem.addEventListener(...)` line. Centralising the shape here
 * keeps the wrap and the event-name decision in one place — useful when
 * we eventually drop the legacy "raw event name" mode (currently only used
 * by `@client` conditionals).
 */

import { toDomEventName, wrapHandlerInBlock, wrapHandlerForTurn } from '../../utils.ts'

export type EventNameMode = 'dom' | 'raw'

/**
 * Emit `if (<elementVar>) <elementVar>.addEventListener('<eventName>',
 * <wrappedHandler>)` on a single line. The handler is already
 * source-level — pass it verbatim; the helper applies
 * `wrapHandlerInBlock` so block-form arrow functions are safe to drop
 * into an expression position.
 */
export function emitListenerLine(
  lines: string[],
  indent: string,
  elementVar: string,
  eventName: string,
  handler: string,
  mode: EventNameMode = 'dom',
  turnId?: string,
): void {
  // Profile mode (#1690, SR3): when a turn id is supplied the handler is
  // bracketed with beginTurn/endTurn instead of the plain block wrap.
  const wrapped = turnId ? wrapHandlerForTurn(handler, turnId) : wrapHandlerInBlock(handler)
  const name = mode === 'dom' ? toDomEventName(eventName) : eventName
  lines.push(`${indent}if (${elementVar}) ${elementVar}.addEventListener('${name}', ${wrapped})`)
}

/**
 * Emit a `{ qsa lookup; if (elem) addEventListener; }` block on
 * (potentially) multiple lines. Used inside loop renderItem bodies
 * where the element variable doesn't already exist in scope.
 *
 * When `bodyIsMultiRoot` is true, the slot may live on a sibling root of
 * `scopeVar` rather than as a descendant — the lookup uses `qsaItem` so
 * the walk crosses past `scopeVar` into its `<!--bf-loop-i-->`-bounded
 * siblings (#1212).
 */
export function emitListenerBlock(
  lines: string[],
  indent: string,
  scopeVar: string,
  slotId: string,
  elementLocal: string,
  eventName: string,
  handler: string,
  mode: EventNameMode = 'dom',
  bodyIsMultiRoot: boolean = false,
): void {
  const wrapped = wrapHandlerInBlock(handler)
  const name = mode === 'dom' ? toDomEventName(eventName) : eventName
  const lookup = bodyIsMultiRoot ? 'qsaItem' : 'qsa'
  lines.push(`${indent}{ const ${elementLocal} = ${lookup}(${scopeVar}, '[bf="${slotId}"]'); if (${elementLocal}) ${elementLocal}.addEventListener('${name}', ${wrapped}) }`)
}
