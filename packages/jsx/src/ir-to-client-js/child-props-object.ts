/**
 * Spelling of a child component's props object (`initChild` /
 * `createComponent` / `upsertChild` argument).
 *
 * Every call-site builder (top-level child, loop row, composite loop row,
 * conditional branch, static-array row) decides each explicit prop's own
 * value spelling, then hands the list here. This module is the one place
 * that decides how a spread of one of the component's own prop bags (the
 * props object, `SpreadAttr.propsObject`, or its `...rest` binding,
 * `SpreadAttr.callerBag === 'rest'`; both set in Phase 1) merges with the
 * explicit props in source order (#3688, #3713, #3714):
 *
 *   - a spread prop never becomes an entry of its own;
 *   - an explicit prop written before a bag spread that carries its key is
 *     only a default: the caller's own value wins when the caller passed
 *     that key;
 *   - an explicit prop written after it wins as written;
 *   - every key the caller passed, the call did not name and a bag spread
 *     carries is forwarded through `forwardProps`, as getters, so it stays
 *     reactive. A rest bag does not carry the keys the component
 *     destructured (`SpreadAttr.restOmittedKeys`).
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
 * The caller keys a spread of one of the component's own prop bags leaves
 * out, or null when `value` is not such a spread: none for the props object
 * (`SpreadAttr.propsObject`), the destructured keys for a `{...rest}` bag
 * (`SpreadAttr.restOmittedKeys`, #3714). The client holds either bag as the
 * caller's whole props object (`_p`).
 */
export function callerBagSpreadOmit(value: AttrValue): readonly string[] | null {
  if (value.kind !== 'spread') return null
  if (value.propsObject === true) return []
  return value.callerBag === 'rest' ? (value.restOmittedKeys ?? []) : null
}

/**
 * Whether a caller-bag spread written after `index` in a child component
 * call carries the key `name` (`<Tag tone="first" {...props} />`,
 * `<Tag tone="first" {...rest} />`). The explicit prop at `index` is then
 * only a default: the spread overrides it when the caller passed that key,
 * as in JS (#3688). A rest bag never carries a key the component
 * destructured, so `<Tag title="x" {...rest} />` keeps `title` as written
 * (#3714). Both the props object built here and the top-level reactive DOM
 * mirrors read this one decision, so an overridden explicit expression
 * can't overwrite the spread-selected value on update.
 */
function laterCallerBagCarries(props: readonly ChildPropLike[], index: number, name: string): boolean {
  for (let at = index + 1; at < props.length; at++) {
    const omit = callerBagSpreadOmit(props[at]!.value)
    if (omit !== null && !omit.includes(name)) return true
  }
  return false
}

/**
 * The caller keys no caller-bag spread of the call carries, or null when
 * the call spreads no caller bag: the keys every one of them leaves out.
 */
function callerBagsOmit(props: readonly ChildPropLike[]): string[] | null {
  let omitted: string[] | null = null
  for (const prop of props) {
    const omit = callerBagSpreadOmit(prop.value)
    if (omit === null) continue
    omitted = omitted === null ? [...omit] : omitted.filter(key => omit.includes(key))
  }
  return omitted
}

/**
 * A `{...rest}` bag as a props object: the caller's props without the keys
 * the component destructured (`omit`), each read through a getter, so it
 * stays live. The one spelling the child props object and the registration
 * template share.
 */
export function restBagExpr(omit: readonly string[]): string {
  return `forwardProps(${PROPS_PARAM}, {}, ${codeSafeStringArray(omit)})`
}

/**
 * The value of an explicit prop a later caller-bag spread overrides (see
 * `laterCallerBagCarries`): the caller's own value when it passed the
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
 * spread is the props object or a `{...rest}` bag
 * (`callerBagSpreadOmit`), merged by `forwardProps`.
 */
export function isObjectSpreadProp(prop: ChildPropLike): boolean {
  return isSpreadPropName(prop.name) && prop.value.kind === 'spread' && prop.value.callerBag === undefined
}

export interface ChildPropsObjectOptions {
  /** Entries appended after the explicit props (e.g. a row's `children` getter). */
  trailing?: readonly string[]
}

/** Whether a child component call spreads one of the component's own prop bags (`callerBagSpreadOmit`). */
export function spreadsCallerBag(props: readonly ChildPropLike[]): boolean {
  return props.some(prop => callerBagSpreadOmit(prop.value) !== null)
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
 * object has the key, and a later caller-bag spread that carries the key
 * (`callerBagSpreadOmit`) wins when the caller passed it
 * (`callerFirstPropExpr`). `expr` as written when no spread follows.
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
  // The last spread kind applied: two caller-bag spreads in a row merge once.
  let last: 'props' | 'object' | null = null
  for (let at = index + 1; at < props.length; at++) {
    const prop = props[at]!
    const omit = callerBagSpreadOmit(prop.value)
    if (omit !== null) {
      if (omit.includes(name)) continue
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
 * wrapped in `forwardProps` for a caller-bag spread. With one, every part
 * merges in source order through `spreadChildProps` (#3861): each run of
 * explicit props is an object literal, an object spread a thunk of its
 * value, a props-object spread the thunk `() => _p`, and a `{...rest}` bag
 * the caller's props without the destructured keys (`restBagExpr`), so a
 * later part wins as in JS.
 */
export function childPropsObjectExpr<P extends ChildPropLike>(
  props: readonly P[],
  valueOf: (prop: P) => ChildPropValue | null,
  options: ChildPropsObjectOptions = {},
): string {
  if (lastObjectSpreadIndex(props) >= 0) return spreadPartsExpr(props, valueOf, options)
  const bagsOmit = callerBagsOmit(props)
  const entries: string[] = []
  const explicitNames: string[] = []
  props.forEach((prop, index) => {
    if (isSpreadPropName(prop.name)) return
    const value = valueOf(prop)
    if (!value) return
    explicitNames.push(prop.name)
    const key = quotePropName(prop.name)
    if (laterCallerBagCarries(props, index, prop.name)) {
      entries.push(`get ${key}() { return ${callerFirstPropExpr(prop.name, value.expr)} }`)
    } else {
      entries.push(explicitEntry(key, value))
    }
  })
  entries.push(...(options.trailing ?? []))
  const object = objectLiteral(entries)
  if (bagsOmit === null) return object
  const excluded = [...explicitNames, ...bagsOmit.filter(key => !explicitNames.includes(key))]
  return `forwardProps(${PROPS_PARAM}, ${object}, ${codeSafeStringArray(excluded)})`
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
  const flush = (): void => {
    if (entries.length > 0) parts.push(objectLiteral(entries))
    entries = []
  }
  for (const prop of props) {
    if (prop.value.kind === 'spread' && prop.value.propsObject === true) {
      flush()
      parts.push(`() => ${PROPS_PARAM}`)
      continue
    }
    const restOmit = callerBagSpreadOmit(prop.value)
    if (restOmit !== null) {
      flush()
      parts.push(restBagExpr(restOmit))
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
    entries.push(explicitEntry(quotePropName(prop.name), value))
  }
  entries.push(...(options.trailing ?? []))
  flush()
  return `spreadChildProps(${parts.join(', ')})`
}
