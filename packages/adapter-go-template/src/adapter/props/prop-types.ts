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
