/**
 * The props a DSL adapter passes to a child component's `render_child`
 * call (#3479), as data.
 *
 * Every DSL adapter assembles them the same way: callback props and `ref`
 * are client-only and dropped; a named JSX-valued prop is captured as
 * HTML; `{...props}` (the component's own props object, which no DSL scope
 * holds as one value) enumerates the props params, and a param that
 * something earlier in the call may have set is carried only when the
 * caller passed it ({@link propsSpreadParam}); any other spread is folded
 * in at its source position, so a later entry wins on a key conflict, as in
 * `{...a, ...b}`; then the compiler-controlled `_bf_slot` and `children`
 * entries come last, so a spread can never override them.
 * {@link planComponentProps} makes those decisions once. An adapter spells
 * the entries and spreads through {@link spellComponentProps}, keeps its
 * own capture mechanism (`{% set %}…{% endset %}`, `_erbout.slice!`,
 * `begin … end`, a Kolon macro), and folds the spelled segments into its
 * own hash literal. An adapter that builds the child's input as a typed
 * literal at compile time instead (Go's `<Child>Input{...}`) reads the same
 * plan one key at a time through {@link resolveComponentPropKeys}.
 */

import { resolveJsxChildrenProp } from '@barefootjs/shared'
import type { AttrValue, IRComponent, IRNode, SpreadAttr } from '../types.ts'
import { derivesScopeFromSlot } from './child-scope.ts'

/** One entry of the props hash. */
export type ComponentPropEntry =
  /** An ordinary prop: the adapter lowers `value` with its `AttrValueEmitter`. */
  | { kind: 'value'; name: string; value: AttrValue }
  /** A named JSX-valued prop (`header={<b/>}`): captured as HTML, passed by reference. */
  | { kind: 'named-slot'; name: string; children: IRNode[] }
  /** One param of a spread props object (`{...props}`), read from its own template variable. */
  | { kind: 'props-param'; name: string }
  /** The child's mount slot, for its scope id (`derivesScopeFromSlot`). */
  | { kind: 'slot-id'; slotId: string }
  /** The forwarded children (nested `<Box>…</Box>`, or `children={<jsx/>}`): captured as HTML. */
  | { kind: 'children'; children: IRNode[] }

/**
 * A run of entries, a spread folded in at its source position, or one param
 * of `{...props}` that the spread carries only when the caller passed it
 * ({@link propsSpreadParam}). An adapter folds a `present-param` in like a
 * spread of a one-key (or empty) hash.
 */
export type ComponentPropSegment =
  | { kind: 'entries'; entries: ComponentPropEntry[] }
  | { kind: 'spread'; value: SpreadAttr }
  | { kind: 'present-param'; name: string }

/** A props param as `{...props}` enumerates it. */
export interface ComponentPropsParam {
  name: string
  /** `false` for a required param, which the caller always passes. Unknown counts as optional. */
  optional?: boolean
}

export interface ComponentPropsOptions {
  /** The SolidJS-style props identifier (`function C(props: P)`), if any. */
  propsObjectName: string | null
  /** The analyzer-extracted props params, which `{...props}` enumerates. */
  propsParams: ReadonlyArray<ComponentPropsParam>
  /**
   * Whether the backend's runtime records which keys each component's
   * caller passed, so a template can ask it whether a param was passed
   * rather than whether it is nil (the DSL runtimes' `passed(name,
   * fallback)`). See {@link propsSpreadParam}.
   */
  callerKeys?: boolean
}

/** What a call has set before a `{...props}` spread, as far as the compiler can see. */
export interface EarlierComponentProps {
  /** The keys an earlier entry sets. */
  keys: ReadonlySet<string>
  /** Whether an earlier spread whose keys are unknown may have set any key. */
  spread: boolean
}

/**
 * How `{...props}` carries one param. JS spreads only the keys the props
 * object has, so a param the caller left out keeps whatever an earlier entry
 * or spread set: `<Tag size="s" {...props} />` keeps `size="s"` when the
 * caller passes no `size`.
 *
 * - `'entry'`: an ordinary entry. Either nothing earlier can set the key, so
 *   an absent param and a nil one read the same to the child, or the param is
 *   required, so the caller always passes it and it always wins.
 * - `'present'`: carried only when the caller passed it, so an absent param
 *   leaves the earlier value alone.
 *
 * A template engine reads an absent prop and an explicit `undefined` or
 * `null` one as the same nil, so "passed" can't be spelled "not nil": a
 * caller that passes `null` must still override the earlier value, as JS
 * does. With `callerKeys`, the runtime answers "passed" from the keys the
 * caller actually handed over, and every optional param is `'present'`:
 * an `'entry'` would hand the child the key even when the caller left it
 * out, and the child would then read it as passed (a nil overriding its
 * own earlier prop in a further `{...props}`). Without `callerKeys` (Go,
 * whose Input struct can't tell the two nils apart), "passed" is "not
 * nil", and an explicit nil keeps the earlier value (limitation
 * `props-spread-explicit-null-override`).
 */
export function propsSpreadParam(
  param: ComponentPropsParam,
  earlier: EarlierComponentProps,
  callerKeys = false,
): 'entry' | 'present' {
  if (param.optional === false) return 'entry'
  if (callerKeys) return 'present'
  return earlier.spread || earlier.keys.has(param.name) ? 'present' : 'entry'
}

/** The key an entry sets in the props hash. */
export function componentPropKey(entry: ComponentPropEntry): string {
  if (entry.kind === 'slot-id') return '_bf_slot'
  if (entry.kind === 'children') return 'children'
  return entry.name
}

/**
 * The ordered props segments for `comp`. The first segment is always an
 * (possibly empty) entries segment, and a spread or a `present-param` is
 * followed by a new one only when an entry comes after it.
 */
export function planComponentProps(
  comp: Pick<IRComponent, 'props' | 'children' | 'slotId' | 'loopItemRoot'>,
  options: ComponentPropsOptions,
): ComponentPropSegment[] {
  const segments: ComponentPropSegment[] = [{ kind: 'entries', entries: [] }]
  const earlier = { keys: new Set<string>(), spread: false }
  const push = (entry: ComponentPropEntry) => {
    earlier.keys.add(componentPropKey(entry))
    const last = segments[segments.length - 1]!
    if (last.kind !== 'entries') {
      segments.push({ kind: 'entries', entries: [entry] })
      return
    }
    // A repeated key keeps its first position and takes the later value, as
    // in a JS object literal (`{...props, tone: 'x'}`), so no backend sees a
    // duplicate key (Ruby warns on one in a hash literal).
    const at = last.entries.findIndex((e) => componentPropKey(e) === componentPropKey(entry))
    if (at === -1) last.entries.push(entry)
    else last.entries[at] = entry
  }
  const pushPropsSpread = () => {
    // Every param is decided against what came before the spread, not
    // against the params this same spread has already pushed.
    const before: EarlierComponentProps = { keys: new Set(earlier.keys), spread: earlier.spread }
    for (const param of options.propsParams) {
      if (propsSpreadParam(param, before, options.callerKeys) === 'entry') {
        push({ kind: 'props-param', name: param.name })
      } else {
        earlier.keys.add(param.name)
        segments.push({ kind: 'present-param', name: param.name })
      }
    }
  }
  for (const p of comp.props) {
    // Callback props and `ref` are client-only for SSR: Hono renders
    // neither, and the client JS wires them at hydration.
    if ((/^on[A-Z]/.test(p.name) || p.name === 'ref') && p.value.kind === 'expression') continue
    if (p.value.kind === 'jsx-children') {
      // `children={<jsx/>}` is forwarded as the `children` entry below.
      if (p.name !== 'children') push({ kind: 'named-slot', name: p.name, children: p.value.children })
    } else if (p.value.kind === 'spread') {
      if (options.propsObjectName !== null && options.propsObjectName === p.value.expr.trim()) {
        pushPropsSpread()
      } else {
        earlier.spread = true
        segments.push({ kind: 'spread', value: p.value })
      }
    } else {
      push({ kind: 'value', name: p.name, value: p.value })
    }
  }
  // A loop row root takes a fresh scope id instead (#2444).
  if (derivesScopeFromSlot(comp)) push({ kind: 'slot-id', slotId: comp.slotId! })
  const children = comp.children.length > 0 ? comp.children : resolveJsxChildrenProp(comp.props)
  if (children.length > 0) push({ kind: 'children', children })
  return segments
}

/** A spelled segment: the entries' hash-literal parts, or the expression a spread folds in. */
export type SpelledComponentPropSegment = { kind: 'entries'; parts: string[] } | { kind: 'spread'; expr: string }

export interface ComponentPropSpelling {
  /** The hash-literal part for one entry; `''` drops it. */
  entry(entry: ComponentPropEntry): string
  /** The expression a spread folds in. */
  spread(value: SpreadAttr): string
  /**
   * The expression a `present-param` segment folds in like a spread: a
   * one-key hash `{ name: <param> }` when the caller passed the param, an
   * empty hash when it did not. "Passed" is the runtime's
   * `passed('<name>', <param is not nil>)`: the caller's keys when the
   * runtime recorded them, the nil test otherwise.
   */
  presentParam(name: string): string
}

/**
 * Spell a plan in source order, so the captures an entry's spelling emits
 * (named slots, then the children) keep their order and counter values.
 */
export function spellComponentProps(
  segments: readonly ComponentPropSegment[],
  spelling: ComponentPropSpelling,
): SpelledComponentPropSegment[] {
  return segments.map((segment) => {
    if (segment.kind === 'spread') return { kind: 'spread', expr: spelling.spread(segment.value) }
    if (segment.kind === 'present-param') return { kind: 'spread', expr: spelling.presentParam(segment.name) }
    const parts: string[] = []
    for (const entry of segment.entries) {
      const part = spelling.entry(entry)
      if (part) parts.push(part)
    }
    return { kind: 'entries', parts }
  })
}

/**
 * One key of the props hash, resolved at compile time: the latest of
 * `presentParams` the caller passed, else `base`.
 */
export interface ResolvedComponentProp {
  key: string
  /** The last entry that sets the key unconditionally, or null when none does. */
  base: ComponentPropEntry | null
  /** The `{...props}` params that override `base` when passed, earliest first. */
  presentParams: string[]
}

/**
 * A plan resolved one key at a time, in the order the keys are first set,
 * for an adapter that builds the child's input as a typed literal at
 * compile time rather than merging hashes at render time. Null when the
 * plan folds in a spread whose keys are unknown: only a render-time merge
 * can resolve that.
 */
export function resolveComponentPropKeys(segments: readonly ComponentPropSegment[]): ResolvedComponentProp[] | null {
  const byKey = new Map<string, ResolvedComponentProp>()
  const at = (key: string): ResolvedComponentProp => {
    let resolved = byKey.get(key)
    if (!resolved) {
      resolved = { key, base: null, presentParams: [] }
      byKey.set(key, resolved)
    }
    return resolved
  }
  for (const segment of segments) {
    if (segment.kind === 'spread') return null
    if (segment.kind === 'present-param') {
      at(segment.name).presentParams.push(segment.name)
      continue
    }
    for (const entry of segment.entries) {
      const resolved = at(componentPropKey(entry))
      resolved.base = entry
      resolved.presentParams = []
    }
  }
  return [...byKey.values()]
}

/** Whether a spelled plan passes no props at all. */
export function isEmptyComponentProps(segments: readonly SpelledComponentPropSegment[]): boolean {
  return segments.every((segment) => segment.kind === 'entries' && segment.parts.length === 0)
}

/**
 * The template a child component renders from: the component's declared
 * name, resolved through an import alias (`import { Foo as Bar }`, `<Bar/>`
 * renders `foo`, #2822), in snake_case.
 */
export function childTemplateName(componentName: string, importAliases: ReadonlyMap<string, string>): string {
  const declaredName = importAliases.get(componentName) ?? componentName
  return declaredName
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
}
