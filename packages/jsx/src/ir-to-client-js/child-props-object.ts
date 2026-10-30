/**
 * Spelling of a child component's props object (`initChild` /
 * `createComponent` / `upsertChild` argument).
 *
 * Every call-site builder (top-level child, loop row, composite loop row,
 * conditional branch, static-array row) decides each explicit prop's own
 * value spelling, then hands the list here. This module is the one place
 * that decides how a spread of the component's own props object
 * (`SpreadAttr.propsObject`, set in Phase 1) merges with the explicit props
 * in source order (#3688, #3713):
 *
 *   - a spread prop never becomes an entry of its own;
 *   - an explicit prop written before the last props-object spread is only a
 *     default: the caller's own value wins when the caller passed that key;
 *   - an explicit prop written after it wins as written;
 *   - every key the caller passed and the call did not name is forwarded
 *     through `forwardProps`, as getters, so it stays reactive.
 */

import type { AttrValue } from '../types.ts'
import { PROPS_PARAM, quotePropName } from './utils.ts'

/** One explicit prop's value as a call-site builder spells it. */
export interface ChildPropValue {
  expr: string
  /** `get key() { return expr }` when true, `key: expr` otherwise. */
  getter: boolean
}

interface ChildPropLike {
  name: string
  value: AttrValue
}

/** True for the IR name of a spread prop (`...` / `...expr`). */
export function isSpreadPropName(name: string): boolean {
  return name.startsWith('...')
}

/**
 * Index of the last spread of the component's own props object in a child
 * component call (`<Tag tone="first" {...props} />`), or -1. An explicit
 * prop written before it is only a default: the spread overrides it when
 * the caller passed that key, as in JS (#3688). Both the props object built
 * here and the top-level reactive DOM mirrors read this one decision, so an
 * overridden explicit expression can't overwrite the spread-selected value
 * on update.
 */
export function lastPropsObjectSpreadIndex(props: readonly ChildPropLike[]): number {
  let at = -1
  props.forEach((p, index) => {
    if (p.value.kind === 'spread' && p.value.propsObject === true) at = index
  })
  return at
}

/**
 * The value of an explicit prop a later props-object spread overrides (see
 * `lastPropsObjectSpreadIndex`): the caller's own value when it passed the
 * key, `expr` otherwise. `forwardProps` lets every override win, so the
 * merge is spelled into the value itself.
 */
export function callerFirstPropExpr(name: string, expr: string): string {
  const key = JSON.stringify(name)
  return `(${key} in ${PROPS_PARAM} ? ${PROPS_PARAM}[${key}] : ${expr})`
}

export interface ChildPropsObjectOptions {
  /** Entries appended after the explicit props (e.g. a row's `children` getter). */
  trailing?: readonly string[]
  /**
   * Forward the caller's props even without a props-object spread — the
   * top-level path's `{...rest}` forwarding, which predates the marker.
   */
  forwardCaller?: boolean
}

/**
 * Build a child component's props object expression. `valueOf` spells one
 * explicit prop's value, or returns null to leave it out (e.g. `key`).
 */
export function childPropsObjectExpr<P extends ChildPropLike>(
  props: readonly P[],
  valueOf: (prop: P) => ChildPropValue | null,
  options: ChildPropsObjectOptions = {},
): string {
  const spreadAt = lastPropsObjectSpreadIndex(props)
  const entries: string[] = []
  const explicitNames: string[] = []
  props.forEach((prop, index) => {
    if (isSpreadPropName(prop.name)) return
    const value = valueOf(prop)
    if (!value) return
    explicitNames.push(prop.name)
    const key = quotePropName(prop.name)
    if (index < spreadAt) {
      entries.push(`get ${key}() { return ${callerFirstPropExpr(prop.name, value.expr)} }`)
    } else {
      entries.push(value.getter ? `get ${key}() { return ${value.expr} }` : `${key}: ${value.expr}`)
    }
  })
  entries.push(...(options.trailing ?? []))
  const object = entries.length > 0 ? `{ ${entries.join(', ')} }` : '{}'
  if (spreadAt < 0 && !options.forwardCaller) return object
  return `forwardProps(${PROPS_PARAM}, ${object}, ${JSON.stringify(explicitNames)})`
}
