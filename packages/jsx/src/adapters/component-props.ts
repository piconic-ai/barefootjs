/**
 * The props a DSL adapter passes to a child component's `render_child`
 * call (#3479), as data.
 *
 * Every DSL adapter assembles them the same way: callback props and `ref`
 * are client-only and dropped; a named JSX-valued prop is captured as
 * HTML; `{...props}` (the component's own props object, which no DSL scope
 * holds as one value) enumerates the props params; any other spread is
 * folded in at its source position, so a later entry wins on a key
 * conflict, as in `{...a, ...b}`; then the compiler-controlled `_bf_slot`
 * and `children` entries come last, so a spread can never override them.
 * {@link planComponentProps} makes those decisions once. An adapter spells
 * the entries and spreads through {@link spellComponentProps}, keeps its
 * own capture mechanism (`{% set %}…{% endset %}`, `_erbout.slice!`,
 * `begin … end`, a Kolon macro), and folds the spelled segments into its
 * own hash literal.
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

/** A run of entries, or a spread folded in at its source position. */
export type ComponentPropSegment =
  | { kind: 'entries'; entries: ComponentPropEntry[] }
  | { kind: 'spread'; value: SpreadAttr }

export interface ComponentPropsOptions {
  /** The SolidJS-style props identifier (`function C(props: P)`), if any. */
  propsObjectName: string | null
  /** The analyzer-extracted props params, which `{...props}` enumerates. */
  propsParams: ReadonlyArray<{ name: string }>
}

/** The key an entry sets in the props hash. */
export function componentPropKey(entry: ComponentPropEntry): string {
  if (entry.kind === 'slot-id') return '_bf_slot'
  if (entry.kind === 'children') return 'children'
  return entry.name
}

/**
 * The ordered props segments for `comp`. The first segment is always an
 * (possibly empty) entries segment, and a spread is followed by a new one
 * only when an entry comes after it.
 */
export function planComponentProps(comp: IRComponent, options: ComponentPropsOptions): ComponentPropSegment[] {
  const segments: ComponentPropSegment[] = [{ kind: 'entries', entries: [] }]
  const push = (entry: ComponentPropEntry) => {
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
  for (const p of comp.props) {
    // Callback props and `ref` are client-only for SSR: Hono renders
    // neither, and the client JS wires them at hydration.
    if ((/^on[A-Z]/.test(p.name) || p.name === 'ref') && p.value.kind === 'expression') continue
    if (p.value.kind === 'jsx-children') {
      // `children={<jsx/>}` is forwarded as the `children` entry below.
      if (p.name !== 'children') push({ kind: 'named-slot', name: p.name, children: p.value.children })
    } else if (p.value.kind === 'spread') {
      if (options.propsObjectName !== null && options.propsObjectName === p.value.expr.trim()) {
        for (const param of options.propsParams) push({ kind: 'props-param', name: param.name })
      } else {
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

/** A spelled segment: the entries' hash-literal parts, or the spread's expression. */
export type SpelledComponentPropSegment = { kind: 'entries'; parts: string[] } | { kind: 'spread'; expr: string }

export interface ComponentPropSpelling {
  /** The hash-literal part for one entry; `''` drops it. */
  entry(entry: ComponentPropEntry): string
  /** The expression a spread folds in. */
  spread(value: SpreadAttr): string
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
    const parts: string[] = []
    for (const entry of segment.entries) {
      const part = spelling.entry(entry)
      if (part) parts.push(part)
    }
    return { kind: 'entries', parts }
  })
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
