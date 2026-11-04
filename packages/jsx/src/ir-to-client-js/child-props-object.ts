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
import { codeSafeStringLiteral, PROPS_PARAM, quotePropName } from './utils.ts'

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
  const key = codeSafeStringLiteral(name)
  return `(${key} in ${PROPS_PARAM} ? ${PROPS_PARAM}[${key}] : ${expr})`
}

/**
 * True for a spread of an arbitrary object onto a child component
 * (`<Chip {...row} />`, a loop row `{...r}`): not one of the caller's own
 * prop bags (`SpreadAttr.callerBag`, decided in Phase 1). Its keys are
 * merged in source order through `spreadChildProps` (#3861). A caller-bag
 * spread is the props object (`propsObject`, merged by `forwardProps`) or a
 * `{...rest}` bag, which the top-level path forwards whole.
 */
export function isObjectSpreadProp(prop: ChildPropLike): boolean {
  return isSpreadPropName(prop.name) && prop.value.kind === 'spread' && prop.value.callerBag === undefined
}

export interface ChildPropsObjectOptions {
  /** Entries appended after the explicit props (e.g. a row's `children` getter). */
  trailing?: readonly string[]
  /**
   * Forward the caller's props even without a props-object spread — the
   * top-level path's `{...rest}` forwarding, which predates the marker.
   */
  forwardCaller?: boolean
  /**
   * The caller's `{...rest}` bag as a props object (the caller's props
   * without the keys the component destructured), so a call that also
   * spreads an object merges the bag in source order as one more part.
   * Without it a rest bag spread is left to `forwardCaller`.
   */
  restBag?: string
}

/**
 * A JS array literal of code-safe string literals (`codeSafeStringLiteral`),
 * printed exactly as `JSON.stringify` prints an array of ordinary names.
 */
export function codeSafeStringArray(values: readonly string[]): string {
  return `[${values.map(codeSafeStringLiteral).join(',')}]`
}

/** An object literal of `entries`, `{}` when there are none. */
function objectLiteral(entries: readonly string[]): string {
  return entries.length > 0 ? `{ ${entries.join(', ')} }` : '{}'
}

/** Index of the last object spread (`isObjectSpreadProp`) in a child component call, or -1. */
export function lastObjectSpreadIndex(props: readonly ChildPropLike[]): number {
  let at = -1
  props.forEach((p, index) => {
    if (isObjectSpreadProp(p)) at = index
  })
  return at
}

/**
 * The value of the explicit prop at `index` for a reactive DOM mirror,
 * merged with every spread written after it, as the props object merges
 * them: a later object spread (`spreadOf` spells its value) wins when its
 * object has the key, and a later props-object spread wins when the caller
 * passed it (`callerFirstPropExpr`). `expr` as written when no spread
 * follows.
 */
export function mergedExplicitPropExpr<P extends ChildPropLike>(
  props: readonly P[],
  index: number,
  expr: string,
  spreadOf: (prop: P) => string,
): string {
  const name = props[index]!.name
  const key = codeSafeStringLiteral(name)
  let merged = expr
  // The last spread kind applied: two props-object spreads in a row merge once.
  let last: 'props' | 'object' | null = null
  for (let at = index + 1; at < props.length; at++) {
    const prop = props[at]!
    if (prop.value.kind === 'spread' && prop.value.propsObject === true) {
      if (last !== 'props') merged = callerFirstPropExpr(name, merged)
      last = 'props'
    } else if (isObjectSpreadProp(prop)) {
      merged = `((__s) => __s != null && ${key} in Object(__s) ? Object(__s)[${key}] : ${merged})(${spreadOf(prop)})`
      last = 'object'
    }
  }
  return merged
}

/**
 * Build a child component's props object expression. `valueOf` spells one
 * explicit prop's value, or returns null to leave it out (e.g. `key`). It
 * also spells an object spread's value (`isObjectSpreadProp`).
 *
 * Without an object spread, the explicit props form one object literal,
 * wrapped in `forwardProps` for a props-object spread (or the caller
 * forwarding). With one, every part merges in source order through
 * `spreadChildProps` (#3861): each run of explicit props is an object
 * literal, an object spread a thunk of its value, and a props-object spread
 * the thunk `() => _p`, so a later part wins as in JS. A `{...rest}` bag is
 * a part too when the caller spells it (`restBag`); otherwise it is
 * forwarded off `_p` after the merge.
 */
export function childPropsObjectExpr<P extends ChildPropLike>(
  props: readonly P[],
  valueOf: (prop: P) => ChildPropValue | null,
  options: ChildPropsObjectOptions = {},
): string {
  if (lastObjectSpreadIndex(props) >= 0) return spreadPartsExpr(props, valueOf, options)
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
      entries.push(explicitEntry(key, value))
    }
  })
  entries.push(...(options.trailing ?? []))
  const object = objectLiteral(entries)
  if (spreadAt < 0 && !options.forwardCaller) return object
  return `forwardProps(${PROPS_PARAM}, ${object}, ${codeSafeStringArray(explicitNames)})`
}

/** One explicit prop's object-literal entry: a getter or a data property. */
function explicitEntry(key: string, value: ChildPropValue): string {
  return value.getter ? `get ${key}() { return ${value.expr} }` : `${key}: ${value.expr}`
}

/** {@link childPropsObjectExpr} for a call with an object spread: `spreadChildProps(...parts)`. */
function spreadPartsExpr<P extends ChildPropLike>(
  props: readonly P[],
  valueOf: (prop: P) => ChildPropValue | null,
  options: ChildPropsObjectOptions,
): string {
  const parts: string[] = []
  let entries: string[] = []
  const explicitNames: string[] = []
  let mergesCaller = false
  const flush = (): void => {
    if (entries.length > 0) parts.push(objectLiteral(entries))
    entries = []
  }
  for (const prop of props) {
    if (prop.value.kind === 'spread' && prop.value.propsObject === true) {
      flush()
      parts.push(`() => ${PROPS_PARAM}`)
      mergesCaller = true
      continue
    }
    if (prop.value.kind === 'spread' && prop.value.callerBag === 'rest' && options.restBag !== undefined) {
      flush()
      parts.push(options.restBag)
      mergesCaller = true
      continue
    }
    if (isSpreadPropName(prop.name) && !isObjectSpreadProp(prop)) continue
    const value = valueOf(prop)
    if (!value) continue
    if (isObjectSpreadProp(prop)) {
      flush()
      parts.push(`() => (${value.expr})`)
      continue
    }
    explicitNames.push(prop.name)
    entries.push(explicitEntry(quotePropName(prop.name), value))
  }
  entries.push(...(options.trailing ?? []))
  flush()
  const merged = `spreadChildProps(${parts.join(', ')})`
  if (!options.forwardCaller || mergesCaller) return merged
  return `forwardProps(${PROPS_PARAM}, ${merged}, ${codeSafeStringArray(explicitNames)})`
}
