/**
 * Compile-time constant tables for the minijinja template adapter.
 *
 * Near-verbatim port of
 * `packages/adapter-jinja/src/adapter/lib/constants.ts` (itself extracted
 * the way `packages/adapter-xslate/src/adapter/lib/constants.ts` is) — the
 * emitted Jinja2-compatible expression syntax is identical, so the table
 * (and its `JINJA_*`-prefixed names) ports unchanged.
 */

import type { PrimitiveSpec } from './types.ts'

/**
 * Single source of truth for the adapter's template-primitive
 * surface. Each entry pairs the expected arity with the emit function.
 *
 * The emit fn returns a Jinja expression (no surrounding `{{ }}`) suitable
 * for embedding inside an interpolation — `bf.json(val)`, `bf.floor(val)`,
 * etc. The same primitive names as the Xslate adapter, but invoked as
 * `bf.NAME(args)` (bare, no `$` sigil) instead of `$bf.NAME(args)`.
 */
export const JINJA_TEMPLATE_PRIMITIVES: Record<string, PrimitiveSpec> = {
  'JSON.stringify': { arity: 1, emit: (args) => `bf.json(${args[0]})` },
  'String':         { arity: 1, emit: (args) => `bf.string(${args[0]})` },
  'Number':         { arity: 1, emit: (args) => `bf.number(${args[0]})` },
  'Math.floor':     { arity: 1, emit: (args) => `bf.floor(${args[0]})` },
  'Math.ceil':      { arity: 1, emit: (args) => `bf.ceil(${args[0]})` },
  'Math.round':     { arity: 1, emit: (args) => `bf.round(${args[0]})` },
}

/**
 * Module-scope `templatePrimitives` map derived once from the spec record.
 */
export const JINJA_PRIMITIVE_EMIT_MAP: Record<string, (args: string[]) => string> =
  Object.fromEntries(
    Object.entries(JINJA_TEMPLATE_PRIMITIVES).map(([k, v]) => [k, v.emit])
  )
