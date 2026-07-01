/**
 * Backend-neutral destructuring of a recognised `queryHref(base, { … })` call
 * (#2042) into a base expression plus include triples, shared by the SSR
 * adapters' query lowering.
 *
 * `queryHref` is the pure functional URL-query builder (the counterpart to
 * `searchParams()`); its call + object literal are already structured IR, so an
 * adapter lowers it to its query helper without any block-body recognition or
 * re-parse. This module only does the structural match — turning the object
 * literal's properties into `{ guard, key, value }` triples — leaving each
 * adapter to format the include condition and the helper call in its own
 * template language.
 *
 * Inclusion is truthy-omit over string values (matching the client `queryHref`'s
 * `if (value)`): a plain `key: v` is included iff `v` is a non-empty string
 * (`guard: null`); a conditional `key: cond ? a : <undefined|null|''>` is
 * included iff `cond` AND `a` is non-empty (`guard: cond`, `value: a`).
 */

import type { ParsedExpr } from './expression-parser.ts'

export interface QueryHrefTriple {
  /**
   * The conditional test of a `key: cond ? a : <omit>` include, or null for a
   * plain `key: v` (which is included purely on value-truthiness). An adapter
   * combines this with the value's non-emptiness to form the include condition.
   */
  guard: ParsedExpr | null
  /** The literal search-param key. */
  key: string
  /** The value expression (the consequent for a conditional include). */
  value: ParsedExpr
}

export interface QueryHrefCall {
  base: ParsedExpr
  triples: QueryHrefTriple[]
}

/**
 * Match a `queryHref(base, { … })` call from its callee + args, returning the
 * base and include triples, or null when it isn't a `queryHref` call with a
 * plain object-literal second argument (→ the adapter falls back to its generic
 * lowering). `localNames` are the bindings `queryHref` is imported under — the
 * caller resolves them (the `@barefootjs/router/register` lowering plugin, #2057).
 */
export function matchQueryHrefCall(
  callee: ParsedExpr,
  args: readonly ParsedExpr[],
  localNames: ReadonlySet<string>,
): QueryHrefCall | null {
  if (callee.kind !== 'identifier' || !localNames.has(callee.name)) return null
  if (args.length !== 2) return null
  const [base, obj] = args
  // A dynamic (non-literal) params object can't be lowered to static include
  // triples — fall back to the generic lowering.
  if (obj.kind !== 'object-literal') return null

  const triples: QueryHrefTriple[] = []
  for (const p of obj.properties) {
    const v = p.value
    if (v.kind === 'conditional' && isOmitBranch(v.alternate)) {
      triples.push({ guard: v.test, key: p.key, value: v.consequent })
    } else {
      triples.push({ guard: null, key: p.key, value: v })
    }
  }
  return { base, triples }
}

/**
 * Format a {@link QueryHrefCall} as the flat argument list for a guard-list
 * query helper (`bf->query(base, guard, key, value, …)` in Mojo / `$bf.query(…)`
 * in Xslate — the two adapters whose helper does the non-empty check itself).
 * Each triple contributes a guard (`'1'` for a plain include, or the lowered
 * condition for a conditional one), the key as a string literal, and the value —
 * all lowered through the adapter's `emit`. The caller wraps the result in its
 * own `<helper>(…)` call. (The go-template adapter folds the non-empty check
 * into the include condition itself, so it formats its own form instead.)
 *
 * A conditional guard that is NOT already boolean-shaped (a bare value, a member
 * access, `&&`/`||`) is JS *string* truthiness — `'0'` is a truthy string in JS
 * but false under Perl's `unless`. To keep SSR byte-identical to the client (and
 * to the go adapter, whose `lowerUrlGuard` does the same), such a guard is
 * normalised to a `guard !== ''` test, emitted against a string literal so each
 * adapter renders string `ne`, not numeric `!=`. Comparisons / `!x` / boolean
 * literals already yield a real boolean and pass through unchanged.
 */
export function queryHrefArgs(q: QueryHrefCall, emit: (e: ParsedExpr) => string): string[] {
  const out = [emit(q.base)]
  for (const t of q.triples) {
    if (t.guard === null) {
      out.push('1')
    } else if (isBoolShapeGuard(t.guard)) {
      out.push(`(${emit(t.guard)})`)
    } else {
      const test: ParsedExpr = {
        kind: 'binary',
        op: '!==',
        left: t.guard,
        right: { kind: 'literal', value: '', literalType: 'string' },
      }
      out.push(`(${emit(test)})`)
    }
    out.push(emit({ kind: 'literal', value: t.key, literalType: 'string' }))
    out.push(emit(t.value))
  }
  return out
}

const GUARD_BOOL_OPS: ReadonlySet<string> = new Set([
  '==',
  '===',
  '!=',
  '!==',
  '<',
  '>',
  '<=',
  '>=',
])

/**
 * Whether a conditional-include guard already evaluates to a real boolean, so it
 * can be emitted as-is rather than wrapped in a `!== ''` string-truthiness test.
 * A comparison, a `!negation`, or a boolean literal qualifies; a bare value /
 * member / `&&` / `||` does not. Mirrors the go adapter's `lowerUrlGuard`
 * `isBoolShape` so the four backends agree on which guards need normalising.
 */
function isBoolShapeGuard(g: ParsedExpr): boolean {
  return (
    (g.kind === 'binary' && GUARD_BOOL_OPS.has(g.op)) ||
    (g.kind === 'unary' && g.op === '!') ||
    (g.kind === 'literal' && g.literalType === 'boolean')
  )
}

/**
 * The falsy "omit" branch of a conditional include — `undefined` (an identifier),
 * `null`, or `''` — which makes `cond ? v : <omit>` a conditional include.
 */
function isOmitBranch(node: ParsedExpr): boolean {
  if (node.kind === 'identifier') return node.name === 'undefined'
  if (node.kind === 'literal') {
    return node.literalType === 'null' || (node.literalType === 'string' && node.value === '')
  }
  return false
}
