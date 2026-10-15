/**
 * Prop classification shared by the DSL template adapters (#3475).
 *
 * Pure functions over `ir.metadata` that derive per-compile prop sets an
 * adapter consults during lowering; no adapter instance state.
 */

import type { ComponentIR } from '../types.ts'

/**
 * Props whose declared TS type is boolean. A bare binding of one
 * (`data-active={props.isActive}`) must stringify as JS `String(boolean)`
 * ("true"/"false"), not the host language's own boolean text (Python's
 * `True`, Perl's `1` / `''`) (#1897, pagination's data-active).
 */
export function collectBooleanTypedProps(ir: ComponentIR): Set<string> {
  return new Set(
    ir.metadata.propsParams
      .filter(prop => prop.type?.primitive === 'boolean' || prop.type?.raw === 'boolean')
      .map(prop => prop.name),
  )
}

/**
 * Props whose presence is uncertain: no default, and non-primitive typed OR
 * declared optional (#2259, e.g. textarea's `rows`). A bare reference to one
 * is absent (`None` / `nil` / `null` / `undef`) when the caller omits it, so
 * each adapter guards it with its own presence test before rendering.
 */
export function collectNullableOptionalProps(ir: ComponentIR): Set<string> {
  return new Set([
    ...ir.metadata.propsParams
      .filter(
        p =>
          p.defaultValue === undefined &&
          !p.isRest &&
          (p.type?.kind !== 'primitive' || p.optional),
      )
      .map(p => p.name),
    // A closed-type `{...rest}` key (#3057) is never destructured with its
    // own default the way a normal prop can be, so it is always presence-
    // uncertain the same way a no-default optional prop is — guard it the
    // same way so `<span {...rest}>` omits a caller-omitted key instead of
    // rendering `key=""`. Harmless for a required (non-optional) rest key
    // too: the guard simply always passes for it.
    ...ir.metadata.restPropsExpandedKeys,
  ])
}

export interface BooleanTypedPropContext {
  /** The SolidJS-style props identifier (`function C(props: P)`), if any. */
  propsObjectName: string | null
  /** Props typed `boolean` (`collectBooleanTypedProps`). */
  booleanTypedProps: ReadonlySet<string>
  /** A binding at the read site shadows `name`. */
  isBound(name: string): boolean
}

/**
 * Whether `expr` is a bare read of a boolean-typed prop (`open`,
 * `props.open`), which renders through `bool_str`. Inside a `.map()`
 * callback, a param that shares the prop's name is the row binding, not the
 * prop (#2488).
 */
export function isBooleanTypedPropRef(expr: string, ctx: BooleanTypedPropContext): boolean {
  let bare = expr.trim()
  if (ctx.propsObjectName && bare.startsWith(`${ctx.propsObjectName}.`)) {
    bare = bare.slice(ctx.propsObjectName.length + 1)
  }
  if (!/^[A-Za-z_$][\w$]*$/.test(bare)) return false
  if (ctx.isBound(bare)) return false
  return ctx.booleanTypedProps.has(bare)
}
