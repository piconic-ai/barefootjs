/**
 * Prop-type resolution: decide each prop's Go struct-field type.
 *
 * Free functions over a {@link GoEmitContext}, shared by the Input/Props struct
 * generators and the nillable-field set so they can't drift.
 */

import type { ComponentIR, IRMetadata, IRNode, ParsedExpr } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { typeInfoToGo } from '../type/type-codegen.ts'

/**
 * Build a map from prop name to a better Go type inferred from signals. When a
 * signal is initialized from a prop (`createSignal(props.initial ?? 0)`), the
 * signal's type annotation may be more specific than the prop's `TypeInfo`. Only
 * generic prop types (containing `interface{}`) are overridden.
 */
export function buildPropTypeOverrides(ctx: GoEmitContext, ir: ComponentIR): Map<string, string> {
  const overrides = new Map<string, string>()
  for (const signal of ir.metadata.signals) {
    const propNames = [signal.initialValue]
    const extracted = ctx.extractPropNameFromInitialValue(signal.initialValue)
    if (extracted) propNames.push(extracted)

    for (const propName of propNames) {
      const param = ir.metadata.propsParams.find(p => p.name === propName)
      if (!param) continue
      const propGoType = typeInfoToGo(ctx, param.type, param.defaultValue)
      if (propGoType.includes('interface{}')) {
        const signalGoType = typeInfoToGo(ctx, signal.type, signal.initialValue)
        if (!signalGoType.includes('interface{}')) {
          overrides.set(propName, signalGoType)
        }
      }
    }
  }

  // A bare `number`-typed prop with no other evidence resolves to Go `int`
  // (`typeInfoToGo`'s blind default) — but `.toFixed()` can only be called on
  // a real JS number, and the runtime value it formats (e.g. a price, 19.5)
  // may be fractional, which a Go `int` struct field can't hold (assigning a
  // fractional untyped constant to it is a compile error: #2168
  // number-tofixed). Unlike a signal's fractional LITERAL initial value
  // (rescued by `typeInfoToGo`'s own `defaultValue` consultation — the
  // math-methods half of the same divergence), a prop with no default has no
  // literal to read the fraction off of; the usage of `.toFixed()` itself is
  // the only available evidence, so it's collected by walking the JSX tree.
  for (const propName of collectToFixedPropNames(ir.root)) {
    const param = ir.metadata.propsParams.find(p => p.name === propName)
    if (!param) continue
    const resolved = overrides.get(propName) ?? typeInfoToGo(ctx, param.type, param.defaultValue)
    if (resolved === 'int') {
      overrides.set(propName, 'float64')
    }
  }

  return overrides
}

/**
 * Names of identifiers used as the receiver of `.toFixed(...)` anywhere in
 * the component's JSX tree (text expressions, conditions, and attribute
 * values). Deliberately narrow — `.toFixed()` is the one number-shape usage
 * that needs this rescue (see `buildPropTypeOverrides` above); it isn't a
 * general "infer number-ness from usage" walker.
 *
 * KNOWN LIMITATION: only a DIRECT identifier receiver in the JSX tree is
 * caught (`{price.toFixed(2)}`). A bare `number` prop with no default is
 * still silently typed `int` — and hits the exact same `go run` compile
 * failure (#2168 number-tofixed) on a fractional runtime value — if the
 * fraction only surfaces indirectly (`.toFixed()` inside a signal's
 * initial value or a memo's computation, reached via `ir.metadata` rather
 * than `ir.root`) or via any OTHER fraction-producing operation on the
 * same bare prop (division, `Math.round`/`Math.floor`, etc. — none of
 * which carry the same unambiguous "this must be a real JS number" signal
 * `.toFixed()` does). Widening this walker to those cases is a real,
 * currently-unaddressed gap, not a hypothetical one — flag it rather than
 * treating a future occurrence as a fresh regression.
 */
function collectToFixedPropNames(root: IRNode): Set<string> {
  const names = new Set<string>()
  const checkExpr = (expr: ParsedExpr | undefined) => {
    if (expr?.kind === 'array-method' && expr.method === 'toFixed' && expr.object.kind === 'identifier') {
      names.add(expr.object.name)
    }
  }
  const walk = (node: IRNode | null | undefined) => {
    if (!node) return
    if (node.type === 'expression') checkExpr(node.parsed)
    if (node.type === 'conditional') {
      checkExpr(node.parsedCondition)
      walk(node.whenTrue)
      walk(node.whenFalse)
    }
    if (node.type === 'element') {
      for (const attr of node.attrs) {
        if (attr.value.kind === 'expression') checkExpr(attr.value.parsed)
      }
    }
    if ('children' in node && Array.isArray(node.children)) {
      node.children.forEach(walk)
    }
  }
  walk(root)
  return names
}

/**
 * Concrete scalar Go types eligible for the nullish (`??`) nillable flip in
 * `resolvePropGoType`. Only these can round-trip through an `interface{}`
 * field and back via a constructor type assertion / `bf.ToInt`-style
 * coercion (see the fallback-var emission in `generateNewPropsFunction`).
 */
export const NULLISH_SCALAR_GO_TYPES: ReadonlySet<string> = new Set(['string', 'int', 'float64', 'bool'])

/**
 * Names of OPTIONAL props consumed nullish-sensitively — the left operand of
 * a `??` anywhere in the component's parsed expression trees, or a signal's
 * `props.X ?? <literal>` initial value (#2248).
 *
 * Why this matters: JS `??` falls back only on `null`/`undefined`, keeping
 * `''`/`0`/`false`. A Go zero-valued scalar field cannot represent "absent",
 * so a `??`-consumed optional scalar must lower to the adapter's established
 * nillable representation (`interface{}`) for the distinction to exist at
 * render time. `resolvePropGoType` applies that flip using this set.
 *
 * The IR walk is generic (any nested object/array is descended, so parsed
 * trees inside expressions, conditions, attributes, and loops are all seen)
 * and the match is shape-precise: `identifier` left (destructured props) or
 * `<propsObject>.<name>` member left. KNOWN LIMITATION (same class as
 * `collectToFixedPropNames`): an `identifier` left shadowed by a same-named
 * loop/callback param is misattributed to the prop — the flip is then merely
 * unnecessary, not incorrect.
 */
export function collectNullishConsumedPropNames(ctx: GoEmitContext, ir: ComponentIR): Set<string> {
  const names = new Set<string>()
  // A destructure default (`{ className = '' }`) means the binding is never
  // nullish in JS — the default already applied — so such props never need
  // the nillable flip (and `applyGoFallback`'s concrete-typed baking relies
  // on them staying concrete).
  const optionalParams = new Set(
    ir.metadata.propsParams.filter(p => p.optional && p.defaultValue == null).map(p => p.name),
  )
  if (optionalParams.size === 0) return names

  const propsObject = ctx.state.propsObjectName
  const propNameOfLeft = (left: ParsedExpr): string | null => {
    if (left.kind === 'identifier') return left.name
    if (
      left.kind === 'member' &&
      !left.computed &&
      left.object.kind === 'identifier' &&
      left.object.name === propsObject
    ) {
      return left.property
    }
    return null
  }

  // `?? <zero-equivalent literal>` (`?? ''`, `?? 0`, `?? false`) is the one
  // shape where nullish and truthiness semantics coincide — nil and the zero
  // value both land on the same output — so it earns no flip. Only a
  // fallback the zero value must NOT collapse into makes the distinction
  // observable.
  const isZeroEquivalentLiteral = (right: ParsedExpr): boolean =>
    right.kind === 'literal' &&
    (right.value === '' || right.value === false || right.value === null ||
      (right.literalType === 'number' && Number(right.value) === 0))

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    const rec = node as Record<string, unknown>
    if (rec.kind === 'logical' && rec.op === '??' && rec.left && rec.right) {
      const propName = propNameOfLeft(rec.left as ParsedExpr)
      if (propName && optionalParams.has(propName) && !isZeroEquivalentLiteral(rec.right as ParsedExpr)) {
        names.add(propName)
      }
    }
    for (const value of Object.values(rec)) walk(value)
  }
  walk(ir.root)

  // Signal seeds (`createSignal(props.X ?? 1)`) live in metadata, not the
  // tree — reuse the seam's existing `props.X ?? <literal>` recognizer. The
  // zero-equivalent exclusion matches on the Go-formatted fallback literal.
  for (const signal of ir.metadata.signals) {
    const match = ctx.extractPropFallback(signal.initialValue)
    if (!match || !optionalParams.has(match.propName)) continue
    const f = match.goFallback
    if (f === '""' || f === 'false' || f === 'nil' || Number(f) === 0) continue
    names.add(match.propName)
  }
  return names
}

/**
 * Resolve a prop param's Go struct-field type using the SAME logic
 * `generatePropsStruct` / `generateInputStruct` use: a `propTypeOverrides` entry
 * wins, otherwise `typeInfoToGo(param.type, param.defaultValue)`. Factored out so
 * the nillable-field set (`collectNillablePropNames`) can't drift from the
 * emitted field types.
 */
export function resolvePropGoType(
  ctx: GoEmitContext,
  param: IRMetadata['propsParams'][number],
  propTypeOverrides: Map<string, string>,
): string {
  const base = propTypeOverrides.get(param.name) ?? typeInfoToGo(ctx, param.type, param.defaultValue)
  // An OPTIONAL prop typed as a named struct (`opts?: EmblaOptionsType`) lowers
  // to `map[string]interface{}`, not the value struct: a value struct is always
  // truthy in Go templates (so a `{{if .Opts}}`-guarded attribute could never be
  // omitted), whereas a nil/empty map is falsy and round-trips through `bf_json`
  // with only the supplied keys — matching JS `JSON.stringify` of a partial
  // object instead of a zero-filled struct.
  // Gate on `localStructFields` (an actual generated struct), NOT
  // `localTypeNames` — the latter also covers string-union aliases
  // (`placement?: 'top' | 'right' | …`), which must stay their scalar Go type.
  if (param.optional && ctx.state.localStructFields.has(base)) {
    return 'map[string]interface{}'
  }
  // An OPTIONAL scalar prop consumed by `??` lowers to `interface{}` (#2248):
  // a zero-valued `string`/`int` field cannot distinguish "absent" from
  // `''`/`0`, so JS nullish semantics (which KEEP `''`/`0`) are unexpressible
  // on the concrete type. `interface{}` is the adapter's established nillable
  // representation; the `??` template lowering then tests nil-ness via
  // `bf_nullish` and the constructor seeds via a nil check + assertion.
  // Assignment ergonomics are unchanged (plain literals assign into
  // `interface{}`), and the prop joins the existing nillable behaviours
  // (bare-attribute omission) by construction.
  //
  // Gated to `kind: 'primitive'` — a string-union prop
  // (`placement?: 'top' | 'bottom'`) must stay its scalar Go type (the same
  // invariant the struct-map gate above documents): the union-typed
  // class-composition lowerings key off the concrete type, AND the flip
  // would buy nothing — the zero value (`""`) is never a legal union
  // member, so the zero-check already coincides with nullish semantics for
  // every valid input. (A literal-number union containing 0 would be the
  // exception; none exists in the corpus and the conflation is the
  // documented pre-#2248 trade-off there.)
  if (
    param.optional &&
    param.type.kind === 'primitive' &&
    ctx.state.nullishConsumedPropNames.has(param.name) &&
    NULLISH_SCALAR_GO_TYPES.has(base)
  ) {
    return 'interface{}'
  }
  return base
}

/**
 * Build the set of prop NAMES whose resolved Go field type is exactly
 * `interface{}` (nillable, for Hono-style attribute omission). Uses the same
 * `propTypeOverrides` + `resolvePropGoType` pipeline as the struct generators.
 * Concrete (`string`/`int`/`bool`/`[]T`/struct) types are excluded.
 */
export function collectNillablePropNames(ctx: GoEmitContext, ir: ComponentIR): Set<string> {
  const propTypeOverrides = buildPropTypeOverrides(ctx, ir)
  const nillable = new Set<string>()
  for (const param of ir.metadata.propsParams) {
    if (resolvePropGoType(ctx, param, propTypeOverrides) === 'interface{}') {
      nillable.add(param.name)
    }
  }
  return nillable
}
