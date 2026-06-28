/**
 * Compile-time constant tables for the Go html/template adapter.
 */

import type { PrimitiveSpec } from "./types.ts"
import { wrapGoArg } from "./go-emit.ts"

/**
 * Single source of truth for the Go adapter's template-primitive surface. Each
 * entry pairs the expected arity with the emit function so the two derived maps
 * (`templatePrimitives` and `templatePrimitiveArities`) can't drift out of sync.
 */
export const GO_TEMPLATE_PRIMITIVES: Record<string, PrimitiveSpec> = {
  'JSON.stringify': { arity: 1, emit: (args) => `bf_json ${wrapGoArg(args[0])}` },
  'String':         { arity: 1, emit: (args) => `bf_string ${wrapGoArg(args[0])}` },
  'Number':         { arity: 1, emit: (args) => `bf_number ${wrapGoArg(args[0])}` },
  'Math.floor':     { arity: 1, emit: (args) => `bf_floor ${wrapGoArg(args[0])}` },
  'Math.ceil':      { arity: 1, emit: (args) => `bf_ceil ${wrapGoArg(args[0])}` },
  'Math.round':     { arity: 1, emit: (args) => `bf_round ${wrapGoArg(args[0])}` },
  // Two-arg forms only; an N-arg `Math.min(a, b, c)` falls through to the
  // standard BF101 unsupported-call diagnostic via the arity gate.
  'Math.min':       { arity: 2, emit: (args) => `bf_min ${wrapGoArg(args[0])} ${wrapGoArg(args[1])}` },
  'Math.max':       { arity: 2, emit: (args) => `bf_max ${wrapGoArg(args[0])} ${wrapGoArg(args[1])}` },
}
