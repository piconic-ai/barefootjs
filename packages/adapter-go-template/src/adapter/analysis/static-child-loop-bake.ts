/**
 * Compile-time baking for a static-array `.map()` loop whose body is a
 * single child component with a plain-value (non-JSX) prop set (#2208).
 *
 * `NewXxxProps`'s existing `staticWithoutBody` path (see
 * `go-template-adapter.ts`'s `generateNewPropsFunction`) populates a static
 * loop's child slices from `in.<Name>s` — data the CALLER (handler) must
 * supply. When the loop's array source is itself a fully-static literal
 * (`const items = [{ label: 'Alpha' }, ...]`, #2208), there is no caller
 * input to wait for: every per-item prop value is already known at compile
 * time. `analyzeBakeableStaticChildLoop` resolves that data — the resolved
 * Go literal for each item's input fields, plus its `data-key` — so the
 * constructor can emit `New<Name>Props(<Name>Input{ Field: "value", ... })`
 * directly per item instead of ranging over `in.<Name>s`.
 *
 * Deliberately narrow: only scalar (string/number/boolean) prop values are
 * baked. Anything else (an unresolvable expression, a destructured loop
 * param, a JSX-valued prop) returns `null` so the caller keeps the existing
 * `in.<Name>s`-driven path (or BF101 refusal) unchanged.
 */

import { evaluateStaticLiteral, parseExpression, resolveStaticLoopSource, type ConstantInfo, type IRProp, type ParsedExpr } from '@barefootjs/jsx'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { escapeGoString } from '../lib/go-emit.ts'

export interface BakedStaticChildItem {
  inputFields: Array<{ goField: string; goValue: string }>
  dataKey: string | null
}

export interface BakedStaticChildLoop {
  items: BakedStaticChildItem[]
}

/**
 * Render a compile-time-known JS scalar as a Go template literal (a quoted
 * string / bare number / `true`/`false`), or `null` for anything else
 * (object, array, `null`, `undefined`) — those have no bare-literal Go
 * template form at this layer. Exported for reuse by
 * `static-element-loop-bake.ts` (#2224), which bakes item field values into
 * a plain-element loop body's text/attr positions the same way this module
 * bakes them into a child component's `Input{...}` constructor call.
 */
export function scalarToGoLiteral(value: unknown): string | null {
  if (typeof value === 'string') return `"${escapeGoString(value)}"`
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return null
}

/**
 * Analyze one nested static child-component loop for bakeability. `props`
 * are the child's JSX attrs (`IRLoopChildComponent.props`); `loopArrayParsed`
 * / `loopParam` / `loopKey` come from the same `NestedComponentInfo` the
 * caller already carries. Returns `null` when the shape isn't (yet)
 * bakeable — the caller falls back to its existing behavior unchanged.
 */
export function analyzeBakeableStaticChildLoop(
  nested: {
    props: ReadonlyArray<{ name: string; value: IRProp['value']; isEventHandler: boolean }>
    loopArrayParsed?: ParsedExpr
    loopParam?: string
    loopKey?: string
  },
  localConstants: ReadonlyArray<ConstantInfo>,
  opts?: {
    isNameShadowed?: (name: string) => boolean
    /** The child's rest bag field, and which props route into it (`routesToRestBag`). */
    restBag?: { field: string; routes: (name: string) => boolean }
  },
): BakedStaticChildLoop | null {
  // A destructured loop param's raw pattern text starts with `{`/`[` (the
  // synthesized single-identifier rewrite only applies to a SIMPLE param) —
  // defer rather than mis-bind bindings under a pattern name.
  if (!nested.loopParam || /^[{[]/.test(nested.loopParam)) return null

  const staticItemsResult = resolveStaticLoopSource(nested.loopArrayParsed, localConstants, opts)
  if (staticItemsResult === null) return null

  const items: BakedStaticChildItem[] = []
  for (const item of staticItemsResult) {
    const bindings = new Map<string, unknown>([[nested.loopParam, item]])
    const inputFields = bakeItemInputFields(nested.props, bindings, opts?.restBag)
    if (inputFields === null) return null
    let dataKey: string | null = null
    if (nested.loopKey) {
      const keyExpr = parseExpression(nested.loopKey)
      const keyResolved = evaluateStaticLiteral(keyExpr, bindings)
      if (keyResolved === null) return null
      dataKey = String(keyResolved.value)
    }
    items.push({ inputFields, dataKey })
  }
  return { items }
}

/**
 * One item's `<Child>Input` fields, or null when a prop doesn't resolve to a
 * scalar. A prop the child collects in its rest bag goes into that bag's
 * map; a hyphenated one with no bag, or whose value doesn't bake, is
 * skipped.
 */
function bakeItemInputFields(
  props: ReadonlyArray<{ name: string; value: IRProp['value']; isEventHandler: boolean }>,
  bindings: ReadonlyMap<string, unknown>,
  restBag: { field: string; routes: (name: string) => boolean } | undefined,
): Array<{ goField: string; goValue: string }> | null {
  const inputFields: Array<{ goField: string; goValue: string }> = []
  const bagEntries: string[] = []
  for (const prop of props) {
    if (prop.isEventHandler) continue
    const toBag = restBag?.routes(prop.name) ?? false
    const hyphenated = prop.name.includes('-')
    if (!toBag && hyphenated) continue
    const resolved = resolvePropValue(prop.value, bindings)
    const goValue = resolved === undefined ? null : scalarToGoLiteral(resolved)
    // A hyphenated attr was skipped before it could reach a bag; one that
    // doesn't bake still is, rather than costing the whole loop its bake.
    if (goValue === null && hyphenated) continue
    if (goValue === null) return null
    if (toBag) bagEntries.push(`${JSON.stringify(prop.name)}: ${goValue}`)
    else inputFields.push({ goField: capitalizeFieldName(prop.name), goValue })
  }
  if (restBag && bagEntries.length > 0) {
    inputFields.push({ goField: restBag.field, goValue: `map[string]any{${bagEntries.join(', ')}}` })
  }
  return inputFields
}

/** Resolves a prop's `AttrValue` to a plain JS value, or `undefined` if unresolvable. */
function resolvePropValue(value: IRProp['value'], bindings: ReadonlyMap<string, unknown>): unknown {
  switch (value.kind) {
    case 'literal':
      return value.value
    case 'boolean-shorthand':
    case 'boolean-attr':
      return true
    case 'expression': {
      if (!value.parsed) return undefined
      const resolved = evaluateStaticLiteral(value.parsed, bindings)
      return resolved === null ? undefined : resolved.value
    }
    default:
      // `template` / `spread` / `jsx-children`: not evaluated at this
      // compile-time-baked layer — defer to the existing runtime path.
      return undefined
  }
}
