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
 * Env-signal key → the runtime factory that produces it (`'search'` →
 * `createSearchParams`). Single source of truth for the reverse of the
 * analyzer's `ENV_SIGNAL_FACTORIES` (#2057): an env signal is `createSignal`-
 * shaped for analysis, but every backend that re-emits its declaration (client
 * JS, JSX/Hono SSR) must call this factory, not `createSignal`, so the value is
 * the request-scoped reader rather than stored state.
 */
export const ENV_SIGNAL_CLIENT_FACTORY: Record<string, string> = {
  search: 'createSearchParams',
}

/**
 * The getter name(s) of the `searchParams` env signal in this component.
 *
 * Recognised **structurally** (#2057): the env signal is now declared as a
 * `createSignal`-shaped `const [searchParams, setSearchParams] =
 * createSearchParams()`, so the analyzer collects it into `metadata.signals`
 * with `envReader: 'search'` — exactly like any other signal, but tagged. This
 * function returns those getters (whatever the destructured name is —
 * `searchParams`, or an alias), so adapters match the reader `.get()` call
 * against the binding actually used, with **no `searchParams`-name allow-list**
 * (this supersedes the import-name matching, and the closed #2055).
 *
 * Empty when the component declares no env signal (the component keeps the
 * generic signal lowering).
 */
export function searchParamsLocalNames(metadata: IRMetadata): Set<string> {
  const names = new Set<string>()
  for (const s of metadata.signals) {
    if (s.envReader === 'search') names.add(s.getter)
  }
  return names
}

/**
 * True when the component declares the `searchParams` env signal. Convenience
 * for adapters/harnesses that only need to gate on presence (the lowering
 * itself needs the {@link searchParamsLocalNames} set to match the actual
 * binding in the expression).
 */
export function importsSearchParams(metadata: IRMetadata): boolean {
  return searchParamsLocalNames(metadata).size > 0
}

// `queryHref` recognition moved out of the compiler core into
// `@barefootjs/router/register` (#2057): the router owns which import binds it
// and registers the lowering plugin. Core no longer names `queryHref`.

/**
 * Recognise a `<binding>().<method>(<args>)` env-signal method call from a
 * `call` node's callee + args, where `<binding>` is one of the local names
 * `searchParams` was imported under (`localNames`, from
 * {@link searchParamsLocalNames}). Returns the method name and argument nodes
 * when the receiver is the zero-arg env-signal getter, else null. The caller
 * lowers the match to a real method call on its per-request reader object
 * (`$searchParams->get('sort')` in Mojo, `$searchParams.get('sort')` in
 * Xslate — the canonical `$searchParams` var regardless of the JS alias);
 * without it the generic `member` lowering drops the call + arg.
 */
export function matchSearchParamsMethodCall(
  callee: ParsedExpr,
  args: ParsedExpr[],
  localNames: ReadonlySet<string>,
): { method: string; args: ParsedExpr[] } | null {
  if (callee.kind !== 'member' || callee.computed) return null
  const recv = callee.object
  if (
    recv.kind !== 'call' ||
    recv.args.length !== 0 ||
    recv.callee.kind !== 'identifier' ||
    !localNames.has(recv.callee.name)
  ) {
    return null
  }
  return { method: callee.property, args }
}
