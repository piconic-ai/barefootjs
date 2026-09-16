/**
 * Compile-time constant tables for the Pebble template adapter.
 *
 * Extracted the way `packages/adapter-xslate/src/adapter/lib/constants.ts` is.
 */

import type { PrimitiveSpec } from './types.ts'

/**
 * Single source of truth for the Pebble adapter's template-primitive
 * surface. Each entry pairs the expected arity with the emit function.
 *
 * The emit fn returns a Pebble expression (no surrounding `{{ }}`) suitable
 * for embedding inside an interpolation — `bf.json(val)`, `bf.floor(val)`,
 * etc. The same primitive names as the Xslate adapter, but invoked as
 * `bf.NAME(args)` (bare, no `$` sigil) instead of `$bf.NAME(args)`.
 */
export const PEBBLE_TEMPLATE_PRIMITIVES: Record<string, PrimitiveSpec> = {
  'JSON.stringify': { arity: 1, emit: (args) => `bf.json(${args[0]})` },
  'String':         { arity: 1, emit: (args) => `bf.string(${args[0]})` },
  'Number':         { arity: 1, emit: (args) => `bf.number(${args[0]})` },
  'Math.floor':     { arity: 1, emit: (args) => `bf.floor(${args[0]})` },
  'Math.ceil':      { arity: 1, emit: (args) => `bf.ceil(${args[0]})` },
  'Math.round':     { arity: 1, emit: (args) => `bf.round(${args[0]})` },
  'Math.min':       { arity: 2, emit: (args) => `bf.min(${args[0]}, ${args[1]})` },
  'Math.max':       { arity: 2, emit: (args) => `bf.max(${args[0]}, ${args[1]})` },
  'Math.abs':       { arity: 1, emit: (args) => `bf.abs(${args[0]})` },
  // `isValidElement(x)` — the framework "is this a renderable element (not
  // plain text)?" predicate `Slot`'s `asChild` pattern uses (#2266).
  // Registered as an identity-scoped `templatePrimitive`, resolved in
  // `call()` BEFORE the generic bare-name-call BF101 refusal (#3022,
  // porting #3011/#3012's fix shape from the sibling DSL adapters) — the
  // one caller that legitimately needs to keep compiling under a bare-name
  // call, so it never reaches that refusal at all. Backed by
  // `Bf#is_element` (`java/.../Bf.java`), a port of the shared Go/Ruby/Perl
  // runtimes' `IsValidElement`/`is_element` shape-check.
  'isValidElement': { arity: 1, emit: (args) => `bf.is_element(${args[0]})` },
}

/**
 * Module-scope `templatePrimitives` map derived once from the spec record.
 */
export const PEBBLE_PRIMITIVE_EMIT_MAP: Record<string, (args: string[]) => string> =
  Object.fromEntries(
    Object.entries(PEBBLE_TEMPLATE_PRIMITIVES).map(([k, v]) => [k, v.emit])
  )
