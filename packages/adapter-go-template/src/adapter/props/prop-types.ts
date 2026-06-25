/**
 * Prop-type resolution: decide each prop's Go struct-field type.
 *
 * Free functions over a {@link GoEmitContext}, shared by the Input / Props
 * struct generators and the nillable-field set so they can't drift. They read
 * `state.localStructFields` and `extractPropNameFromInitialValue`, and resolve
 * Go types via the type-codegen module's `typeInfoToGo`.
 */

import type { ComponentIR, IRMetadata } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { typeInfoToGo } from '../type/type-codegen.ts'

/**
 * Build a map from prop name to a better Go type inferred from signals.
 * When a signal is initialized from a prop (e.g., createSignal(props.initial ?? 0)),
 * the signal's type annotation may be more specific than the prop's TypeInfo.
 */
export function buildPropTypeOverrides(ctx: GoEmitContext, ir: ComponentIR): Map<string, string> {
  const overrides = new Map<string, string>()
  for (const signal of ir.metadata.signals) {
    // Check simple identifier reference
    const propNames = [signal.initialValue]
    const extracted = ctx.extractPropNameFromInitialValue(signal.initialValue)
    if (extracted) propNames.push(extracted)

    for (const propName of propNames) {
      const param = ir.metadata.propsParams.find(p => p.name === propName)
      if (!param) continue
      const propGoType = typeInfoToGo(ctx, param.type, param.defaultValue)
      // Override when prop type is generic (interface{} or contains interface{})
      if (propGoType.includes('interface{}')) {
        const signalGoType = typeInfoToGo(ctx, signal.type, signal.initialValue)
        if (!signalGoType.includes('interface{}')) {
          overrides.set(propName, signalGoType)
        }
      }
    }
  }
  return overrides
}

/**
 * Resolve a prop param's Go struct-field type using the SAME logic
 * `generatePropsStruct` / `generateInputStruct` use for the field
 * declaration: a `propTypeOverrides` entry (signal-inferred override)
 * wins, otherwise `typeInfoToGo(param.type, param.defaultValue)`.
 * Factored out so the nillable-field set (`collectNillablePropNames`)
 * can't drift from the actual emitted field types.
 */
export function resolvePropGoType(
  ctx: GoEmitContext,
  param: IRMetadata['propsParams'][number],
  propTypeOverrides: Map<string, string>,
): string {
  const base = propTypeOverrides.get(param.name) ?? typeInfoToGo(ctx, param.type, param.defaultValue)
  // (#1971) An OPTIONAL prop typed as a named struct (e.g. carousel's
  // `opts?: EmblaOptionsType`) lowers to `map[string]interface{}` rather
  // than the value struct. Two reasons: a value struct is always truthy in
  // Go templates, so a `{{if .Opts}}`-guarded attribute (`data-opts={opts ?
  // JSON.stringify(opts) : undefined}`) can never be omitted when the
  // caller leaves it out; and a map round-trips through `bf_json` with only
  // the keys actually supplied, matching JS `JSON.stringify` of a partial
  // object literal instead of a zero-filled struct. A nil/empty map is
  // falsy, so the omit-when-absent guard works for free.
  // Gate on `localStructFields` (an actual generated struct), NOT
  // `localTypeNames` — the latter also covers string-union aliases like
  // `placement?: 'top' | 'right' | …` (tooltip), which must stay their
  // scalar Go type, not become a map.
  if (param.optional && ctx.state.localStructFields.has(base)) {
    return 'map[string]interface{}'
  }
  return base
}

/**
 * Build the set of prop NAMES whose resolved Go field type is exactly
 * `interface{}` (nillable). Uses the same `propTypeOverrides` +
 * `resolvePropGoType` pipeline as the struct generators, so a prop
 * that ends up `interface{}` on the Props struct — and only such a
 * prop — is treated as nillable for Hono-style attribute omission.
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
