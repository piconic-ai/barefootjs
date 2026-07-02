/**
 * Compile-time constant tables for the ERB template adapter.
 *
 * Ported from the Mojolicious adapter's `lib/constants.ts`.
 */

import type { PrimitiveSpec } from './types.ts'

/**
 * Single source of truth for the ERB adapter's template-primitive
 * surface. Each entry pairs the expected arity with the emit function.
 * Adding / removing a primitive is a one-line change.
 *
 * The emit fn returns a Ruby expression (no surrounding `<%= %>`)
 * suitable for embedding inside the ERB template action —
 * `bf.json(val)`, `bf.floor(val)`, etc. Args arrive already
 * Ruby-rendered via `convertExpressionToRuby` recursion, so a caller
 * passing `props.config` reaches the emit fn as `v[:config]`.
 */
export const ERB_TEMPLATE_PRIMITIVES: Record<string, PrimitiveSpec> = {
  'JSON.stringify': { arity: 1, emit: (args) => `bf.json(${args[0]})` },
  'String':         { arity: 1, emit: (args) => `bf.string(${args[0]})` },
  'Number':         { arity: 1, emit: (args) => `bf.number(${args[0]})` },
  'Math.floor':     { arity: 1, emit: (args) => `bf.floor(${args[0]})` },
  'Math.ceil':      { arity: 1, emit: (args) => `bf.ceil(${args[0]})` },
  'Math.round':     { arity: 1, emit: (args) => `bf.round(${args[0]})` },
}

/**
 * Module-scope `templatePrimitives` map derived once from the spec
 * record. Per-instance derivation would re-build the same Map on
 * every `new ErbAdapter()` call.
 */
export const ERB_PRIMITIVE_EMIT_MAP: Record<string, (args: string[]) => string> =
  Object.fromEntries(
    Object.entries(ERB_TEMPLATE_PRIMITIVES).map(([k, v]) => [k, v.emit])
  )
