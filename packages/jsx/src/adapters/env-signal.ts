// Shared recognition of the router v0.5 `searchParams()` environment signal
// for the template-string adapters (Mojo / Xslate today; Go has its own
// struct-field path). A request-scoped reactive env signal reads like an
// ordinary signal getter, but its value is a URLSearchParams-like reader with
// real methods (`.get(key)`) — not a hashref. The generic `member` lowering
// would deref `.get` as a property access and drop the call + argument, so the
// adapters special-case it to a real per-request reader method call. See #1922.

import type { ParsedExpr } from '../expression-parser.ts'
import type { IRMetadata } from '../types.ts'

/**
 * True when the component imports `searchParams` from `@barefootjs/client` —
 * the same import the analyzer allow-lists (`CLIENT_EXPORTS`). Importing the
 * binding is what scopes the dedicated env-signal lowering; a component that
 * never imports it keeps the generic signal lowering. A non-type import of a
 * binding aliased to `searchParams` counts (`import { searchParams as sp }`
 * still reads the env signal through the alias).
 */
export function importsSearchParams(metadata: IRMetadata): boolean {
  return metadata.imports.some(
    imp =>
      imp.source === '@barefootjs/client' &&
      !imp.isTypeOnly &&
      imp.specifiers.some(s => !s.isTypeOnly && (s.alias ?? s.name) === 'searchParams'),
  )
}

/**
 * Recognise a `searchParams().<method>(<args>)` env-signal method call from a
 * `call` node's callee + args. Returns the method name and argument nodes when
 * the receiver is the zero-arg `searchParams()` getter, else null. The caller
 * lowers the match to a real method call on its per-request reader object
 * (`$searchParams->get('sort')` in Mojo, `$searchParams.get('sort')` in
 * Xslate); without it the generic `member` lowering drops the call + arg.
 *
 * Gating on {@link importsSearchParams} is the caller's job — this is a pure
 * shape match so a user binding genuinely named `searchParams` (which can't
 * coexist with the import) is the caller's concern, not this helper's.
 */
export function matchSearchParamsMethodCall(
  callee: ParsedExpr,
  args: ParsedExpr[],
): { method: string; args: ParsedExpr[] } | null {
  if (callee.kind !== 'member' || callee.computed) return null
  const recv = callee.object
  if (
    recv.kind !== 'call' ||
    recv.args.length !== 0 ||
    recv.callee.kind !== 'identifier' ||
    recv.callee.name !== 'searchParams'
  ) {
    return null
  }
  return { method: callee.property, args }
}
