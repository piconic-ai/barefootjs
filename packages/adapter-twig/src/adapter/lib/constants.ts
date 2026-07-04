/**
 * Compile-time constant tables for the Twig template adapter.
 *
 * Ported from `packages/adapter-jinja/src/adapter/lib/constants.ts`.
 */

import type { PrimitiveSpec } from './types.ts'

/**
 * Single source of truth for the Twig adapter's template-primitive surface.
 * Each entry pairs the expected arity with the emit function.
 *
 * The emit fn returns a Twig expression (no surrounding `{{ }}`) suitable
 * for embedding inside an interpolation — `bf.json(val)`, `bf.floor(val)`,
 * etc. Same primitive names and keys as the Jinja adapter.
 */
export const TWIG_TEMPLATE_PRIMITIVES: Record<string, PrimitiveSpec> = {
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
export const TWIG_PRIMITIVE_EMIT_MAP: Record<string, (args: string[]) => string> =
  Object.fromEntries(
    Object.entries(TWIG_TEMPLATE_PRIMITIVES).map(([k, v]) => [k, v.emit])
  )
