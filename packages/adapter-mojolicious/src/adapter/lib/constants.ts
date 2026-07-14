/**
 * Compile-time constant tables for the Mojolicious EP template adapter.
 *
 * Extracted from `mojo-adapter.ts` (domain-module refactor, issue #2018
 * track D).
 */

import type { PrimitiveSpec } from './types.ts'

/**
 * Single source of truth for the Mojolicious adapter's
 * template-primitive surface. Each entry pairs the expected arity
 * with the emit function. Adding / removing a primitive is a
 * one-line change.
 *
 * The emit fn returns a Perl expression (no surrounding `<%= %>`)
 * suitable for embedding inside the Mojo template action —
 * `bf->json($val)`, `bf->floor($val)`, etc. Args arrive already
 * Perl-rendered via `convertExpressionToPerl` recursion, so a
 * caller passing `props.config` reaches the emit fn as `$config`.
 */
export const MOJO_TEMPLATE_PRIMITIVES: Record<string, PrimitiveSpec> = {
  'JSON.stringify': { arity: 1, emit: (args) => `bf->json(${args[0]})` },
  'String':         { arity: 1, emit: (args) => `bf->string(${args[0]})` },
  'Number':         { arity: 1, emit: (args) => `bf->number(${args[0]})` },
  'Math.floor':     { arity: 1, emit: (args) => `bf->floor(${args[0]})` },
  'Math.ceil':      { arity: 1, emit: (args) => `bf->ceil(${args[0]})` },
  'Math.round':     { arity: 1, emit: (args) => `bf->round(${args[0]})` },
  'Math.min':       { arity: 2, emit: (args) => `bf->min(${args[0]}, ${args[1]})` },
  'Math.max':       { arity: 2, emit: (args) => `bf->max(${args[0]}, ${args[1]})` },
  'Math.abs':       { arity: 1, emit: (args) => `bf->abs(${args[0]})` },
  // `isValidElement(x)` — the framework "is this a renderable element (not
  // plain text)?" predicate `Slot`'s `asChild` pattern uses (#2266). A
  // passed-through JSX child is represented as pre-rendered markup on
  // Mojolicious's SSR model too, so a plain STRING child must NOT read as
  // "valid" (mirrors JS's `'tag' in x && 'props' in x`) — previously this
  // callee had no primitive entry at all and fell through to an undeclared
  // `$isValidElement` stash lookup, dying under `use strict`/`vars => 1`.
  'isValidElement': { arity: 1, emit: (args) => `bf->is_element(${args[0]})` },
}

/**
 * Module-scope `templatePrimitives` map derived once from the spec
 * record. Per-instance derivation would re-build the same Map on
 * every `new MojoAdapter()` call.
 */
export const MOJO_PRIMITIVE_EMIT_MAP: Record<string, (args: string[]) => string> =
  Object.fromEntries(
    Object.entries(MOJO_TEMPLATE_PRIMITIVES).map(([k, v]) => [k, v.emit])
  )
