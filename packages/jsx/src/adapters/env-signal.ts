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
 * One env signal's SSR-reader surface — the single place a future env signal
 * registers itself so the adapter seed / memo paths stay open-closed:
 * registering a new env signal is an analyzer factory entry + one registry
 * entry here; adapter seed/memo paths consume the registry and need no edits.
 */
export interface EnvSignalReader {
  /** The analyzer's `envReader` key (`'search'`). */
  key: string
  /**
   * Canonical per-request reader binding every adapter's lowering
   * canonicalises to (`searchParams` → Perl `$searchParams`, Go
   * `in.SearchParams` via capitalisation).
   */
  canonicalName: string
  /** Reader method names the SSR lowerings recognise (`.get(key)`). */
  methods: ReadonlySet<string>
}

/**
 * Env-signal key → its {@link EnvSignalReader} descriptor. The open-closed
 * contract: adding a new env signal is an analyzer factory entry
 * (`ENV_SIGNAL_FACTORIES`, #2057) + one entry here — the adapter seed / memo
 * paths consume this registry (via {@link envSignalReaderFor} /
 * {@link envSignalLocalNames}) and need no edits.
 */
export const ENV_SIGNAL_READERS: ReadonlyMap<string, EnvSignalReader> = new Map([
  ['search', { key: 'search', canonicalName: 'searchParams', methods: new Set(['get']) }],
])

/** Look up an env signal's reader descriptor by its `envReader` key, or `null` when unregistered/absent. */
export function envSignalReaderFor(key: string | undefined): EnvSignalReader | null {
  if (key === undefined) return null
  return ENV_SIGNAL_READERS.get(key) ?? null
}

/**
 * The getter name(s) of env signal(s) in this component, optionally filtered
 * to one `envReader` key.
 *
 * Recognised **structurally** (#2057): an env signal is declared as a
 * `createSignal`-shaped `const [searchParams, setSearchParams] =
 * createSearchParams()`, so the analyzer collects it into `metadata.signals`
 * with `envReader: '<key>'` — exactly like any other signal, but tagged. This
 * function returns those getters (whatever the destructured name is —
 * `searchParams`, or an alias), so adapters match the reader `.get()` call
 * against the binding actually used, with **no name allow-list** (this
 * supersedes the import-name matching, and the closed #2055).
 *
 * With `key` omitted, collects every env signal's getters regardless of
 * which reader they belong to; with `key` given, only that reader's
 * (`searchParamsLocalNames` is the `'search'`-filtered convenience below).
 *
 * Empty when the component declares no matching env signal (the component
 * keeps the generic signal lowering).
 */
export function envSignalLocalNames(metadata: IRMetadata, key?: string): Set<string> {
  const names = new Set<string>()
  for (const s of metadata.signals) {
    if (s.envReader !== undefined && (key === undefined || s.envReader === key)) {
      names.add(s.getter)
    }
  }
  return names
}

/** The getter name(s) of the `searchParams` env signal in this component. See {@link envSignalLocalNames}. */
export function searchParamsLocalNames(metadata: IRMetadata): Set<string> {
  return envSignalLocalNames(metadata, 'search')
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
