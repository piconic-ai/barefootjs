/**
 * Compile-time constant tables for the Text::Xslate (Kolon) template adapter.
 *
 * Extracted from `xslate-adapter.ts` (domain-module refactor, issue #2018
 * track D).
 */

import type { PrimitiveSpec } from './types.ts'

/**
 * Single source of truth for the Xslate adapter's template-primitive
 * surface. Each entry pairs the expected arity with the emit function.
 *
 * The emit fn returns a Kolon expression (no surrounding `<: :>`) suitable
 * for embedding inside an interpolation — `$bf.json($val)`,
 * `$bf.floor($val)`, etc. The same primitive names as the Mojo adapter, but
 * invoked as `$bf.NAME(args)` on the runtime instance instead of `bf->NAME`.
 */
export const XSLATE_TEMPLATE_PRIMITIVES: Record<string, PrimitiveSpec> = {
  'JSON.stringify': { arity: 1, emit: (args) => `$bf.json(${args[0]})` },
  'String':         { arity: 1, emit: (args) => `$bf.string(${args[0]})` },
  'Number':         { arity: 1, emit: (args) => `$bf.number(${args[0]})` },
  'Math.floor':     { arity: 1, emit: (args) => `$bf.floor(${args[0]})` },
  'Math.ceil':      { arity: 1, emit: (args) => `$bf.ceil(${args[0]})` },
  'Math.round':     { arity: 1, emit: (args) => `$bf.round(${args[0]})` },
  'Math.min':       { arity: 2, emit: (args) => `$bf.min(${args[0]}, ${args[1]})` },
  'Math.max':       { arity: 2, emit: (args) => `$bf.max(${args[0]}, ${args[1]})` },
  'Math.abs':       { arity: 1, emit: (args) => `$bf.abs(${args[0]})` },
}

/**
 * Module-scope `templatePrimitives` map derived once from the spec record.
 */
export const XSLATE_PRIMITIVE_EMIT_MAP: Record<string, (args: string[]) => string> =
  Object.fromEntries(
    Object.entries(XSLATE_TEMPLATE_PRIMITIVES).map(([k, v]) => [k, v.emit])
  )
