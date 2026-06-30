// Shared recognition of the router v0.5 `searchParams()` environment signal
// for the template-string adapters (Mojo / Xslate today; Go has its own
// struct-field path). A request-scoped reactive env signal reads like an
// ordinary signal getter, but its value is a URLSearchParams-like reader with
// real methods (`.get(key)`) — not a hashref. The generic `member` lowering
// would deref `.get` as a property access and drop the call + argument, so the
// adapters special-case it to a real per-request reader method call. See #1922.

import type { ParsedExpr } from '../expression-parser.ts'
import type { ImportInfo, IRMetadata } from '../types.ts'

/**
 * The local binding name(s) that `searchParams` from `@barefootjs/client` is
 * imported under in this component — the same import the analyzer allow-lists
 * (`CLIENT_EXPORTS`). Usually the single name `searchParams`, but an aliased
 * import (`import { searchParams as sp }`) binds it to `sp`, and the template
 * expression then reads `sp()` — so adapters must gate + match against the
 * LOCAL name(s), not the literal `searchParams`. Empty when the env signal is
 * not imported (the component keeps the generic signal lowering).
 *
 * `ImportSpecifier.name` is the exported name and `alias` the local rebinding
 * (see `collectImport` in analyzer.ts), so the import is detected by `name ===
 * 'searchParams'` and the local binding is `alias ?? name`. Namespace / default
 * specifiers bind a different identifier and are excluded.
 */
export function searchParamsLocalNames(metadata: { imports: readonly ImportInfo[] }): Set<string> {
  const names = new Set<string>()
  for (const imp of metadata.imports) {
    if (imp.source !== '@barefootjs/client' || imp.isTypeOnly) continue
    for (const s of imp.specifiers) {
      if (s.isTypeOnly || s.isNamespace || s.isDefault) continue
      if (s.name === 'searchParams') names.add(s.alias ?? s.name)
    }
  }
  return names
}

/**
 * True when the component imports the `searchParams` env signal under any local
 * name. Convenience for adapters/harnesses that only need to gate on presence
 * (the lowering itself needs the {@link searchParamsLocalNames} set to match the
 * actual binding in the expression).
 */
export function importsSearchParams(metadata: IRMetadata): boolean {
  return searchParamsLocalNames(metadata).size > 0
}

/**
 * The local binding name(s) that `queryHref` is imported under in this component
 * (#2042) — the pure URL-query builder an adapter lowers to its query helper
 * (`bf_query` in go-template). Matched by the exported name `queryHref` and bound
 * to `alias ?? name`, so an aliased import (`import { queryHref as qh }`) is gated
 * against the LOCAL name. Empty when not imported.
 *
 * Both the main `@barefootjs/client` entry and the `@barefootjs/client/runtime`
 * re-export are accepted: `queryHref` is exported from both, so importing it from
 * either must enable SSR lowering — otherwise the call's object-literal arg would
 * hit the support gate (BF101) on the runtime-entry import path.
 */
export function queryHrefLocalNames(metadata: IRMetadata): Set<string> {
  const names = new Set<string>()
  for (const imp of metadata.imports) {
    if (!QUERY_HREF_SOURCES.has(imp.source) || imp.isTypeOnly) continue
    for (const s of imp.specifiers) {
      if (s.isTypeOnly || s.isNamespace || s.isDefault) continue
      if (s.name === 'queryHref') names.add(s.alias ?? s.name)
    }
  }
  return names
}

/** Entry points that re-export `queryHref` (main + the runtime re-export). */
const QUERY_HREF_SOURCES: ReadonlySet<string> = new Set([
  '@barefootjs/client',
  '@barefootjs/client/runtime',
])

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
