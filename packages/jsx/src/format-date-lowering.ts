/**
 * `formatDate` lowering plugin (#2324) — the pure-function date formatter
 * (`packages/client/src/format-date.ts`). A call to the `formatDate` binding
 * imported from `@barefootjs/client` lowers to a backend-neutral
 * `helper-call` on the `format_date` helper (spec/template-helpers.md), which
 * every adapter renders through its generic helper-call path (#2069) — no
 * adapter-specific recognition code, only the runtime helper each backend
 * ships.
 *
 * The canonical helper arity is 3: a two-arg call site
 * (`formatDate(d, 'YYYY/M/D')`) is normalized here by supplying the
 * `'UTC'` literal the client function defaults to, so backend helpers stay
 * fixed-arity. Unlike the `date` plugin there is no receiver-type gate —
 * `formatDate` is recognised by its import binding (like `queryHref`), and
 * its own receiver contract (native date / ISO string / nil → `''`) is total,
 * so any argument expression the adapter can evaluate is admissible.
 */

import type { ParsedExpr } from './expression-parser.ts'
import type { LoweringNode, LoweringPlugin } from './lowering-registry.ts'
import { formatDateLocalNames } from './adapters/env-signal.ts'

const UTC_LITERAL: ParsedExpr = { kind: 'literal', value: 'UTC', literalType: 'string' }
const EMPTY_NAMES: ParsedExpr = { kind: 'array-literal', elements: [], raw: '[]' } as ParsedExpr

/**
 * Recognise `formatDate(date, pattern[, timeZone[, names]])` against the
 * component's local import bindings, or decline (null): a non-identifier
 * callee, a name not bound to the `@barefootjs/client` import, or an arity
 * outside 2–4. The canonical helper arity is 4 (#2334): omitted `timeZone` /
 * `names` normalize to the `'UTC'` literal and the empty table the client
 * function defaults to, so backend helpers stay fixed-arity.
 */
export function matchFormatDateCall(
  callee: ParsedExpr,
  args: readonly ParsedExpr[],
  locals: ReadonlySet<string>,
): LoweringNode | null {
  if (callee.kind !== 'identifier' || !locals.has(callee.name)) return null
  if (args.length < 2 || args.length > 4) return null
  return {
    kind: 'helper-call',
    helper: 'format_date',
    args: [args[0], args[1], args[2] ?? UTC_LITERAL, args[3] ?? EMPTY_NAMES],
  }
}

export const formatDatePlugin: LoweringPlugin = {
  name: 'formatDate',
  prepare(metadata) {
    const locals = formatDateLocalNames(metadata)
    if (locals.size === 0) return null
    return (callee, args) => matchFormatDateCall(callee, args, locals)
  },
}
