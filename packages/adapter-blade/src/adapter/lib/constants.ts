/**
 * Compile-time constant tables for the Blade template adapter.
 *
 * Ported from `packages/adapter-jinja/src/adapter/lib/constants.ts`.
 */

import type { PrimitiveSpec } from './types.ts'

/**
 * Single source of truth for the Blade adapter's template-primitive surface.
 * Each entry pairs the expected arity with the emit function.
 *
 * The emit fn returns a Blade/PHP expression (no surrounding `{{ }}`)
 * suitable for embedding inside an interpolation — `$bf->json($val)`,
 * `$bf->floor($val)`, etc. Same primitive names and keys as the Jinja/Twig
 * adapters; every `bf.xxx(...)` call becomes `$bf->xxx(...)` (mapping table).
 */
export const BLADE_TEMPLATE_PRIMITIVES: Record<string, PrimitiveSpec> = {
  'JSON.stringify': { arity: 1, emit: (args) => `$bf->json(${args[0]})` },
  'String':         { arity: 1, emit: (args) => `$bf->string(${args[0]})` },
  'Number':         { arity: 1, emit: (args) => `$bf->number(${args[0]})` },
  'Math.floor':     { arity: 1, emit: (args) => `$bf->floor(${args[0]})` },
  'Math.ceil':      { arity: 1, emit: (args) => `$bf->ceil(${args[0]})` },
  'Math.round':     { arity: 1, emit: (args) => `$bf->round(${args[0]})` },
  'Math.min':       { arity: 2, emit: (args) => `$bf->min(${args[0]}, ${args[1]})` },
  'Math.max':       { arity: 2, emit: (args) => `$bf->max(${args[0]}, ${args[1]})` },
  'Math.abs':       { arity: 1, emit: (args) => `$bf->abs(${args[0]})` },
  // `isValidElement(x)` — the framework "is this a renderable element (not
  // plain text)?" predicate `Slot`'s `asChild` pattern uses (#2266, #3012).
  // Backed by `BarefootJS::is_element` (`packages/adapter-php/src/
  // BarefootJS.php`, shared with the Twig adapter — added there by
  // #3012's Twig PR, so this needed zero new runtime code), a port of the
  // shared Perl runtime's `is_element` method the Mojolicious / Xslate
  // adapters' own `isValidElement` primitives call. Registering it here
  // (identity-scoped, by callee name) rather than exempting it
  // structurally (any call in a boolean-test position, the #2994
  // `_boolContext` approach) closes #3012's gap for Blade: previously ANY
  // other bare-name helper call reaching `call()`'s generic fallback from
  // inside a condition/ternary test silently kept the pre-#2994 broken
  // behavior (an unrecognised name resolving against Blade's
  // undefined-variable semantics) instead of refusing with BF101, because
  // the exemption was scoped by structural position, not by which callee
  // it was guarding for. With `isValidElement` resolved here, before the
  // generic fallback is ever reached, the `_boolContext` exemption in
  // `emitters.ts`'s `call()` is no longer needed and has been removed —
  // every OTHER bare-name call now refuses loudly regardless of position,
  // matching the direct-call (non-boolean) behavior
  // `module-const-arrow-helper` / `module-function-helper-chain` already
  // pin.
  'isValidElement': { arity: 1, emit: (args) => `$bf->is_element(${args[0]})` },
}

/**
 * Module-scope `templatePrimitives` map derived once from the spec record.
 */
export const BLADE_PRIMITIVE_EMIT_MAP: Record<string, (args: string[]) => string> =
  Object.fromEntries(
    Object.entries(BLADE_TEMPLATE_PRIMITIVES).map(([k, v]) => [k, v.emit])
  )
