/**
 * Array / string method lowering for the Mojolicious EP template adapter.
 *
 * Extracted from `mojo-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure free functions shared by both the filter-context emitter
 * and the top-level emitter — they take an `emit` callback for receiver /
 * argument recursion and read no adapter instance state.
 */

import {
  parseExpression,
  serializeParsedExpr,
  freeVarsInBody,
} from '@barefootjs/jsx'
import type {
  ParsedExpr,
  ArrayMethod,
  SortComparator,
  ReduceOp,
  FlatDepth,
  FlatMapOp,
} from '@barefootjs/jsx'

/**
 * Lower an `arr.<method>(...)` / `str.<method>(...)` value-builtin call to
 * its Perl form. The IR lifts these into the dedicated `array-method` kind at
 * parse time (see the `arrayMethod` emitter arms), so this is the single
 * place every adapter-supported array/string method is mapped. An unhandled
 * `ArrayMethod` variant throws rather than emitting a silent no-op — the
 * drift defence we already apply to `ParsedExpr.kind` extended to its
 * sub-discriminator.
 */
export function renderArrayMethod(
  method: ArrayMethod,
  object: ParsedExpr,
  args: ParsedExpr[],
  emit: (e: ParsedExpr) => string,
): string {
  switch (method) {
    case 'join': {
      // arr.join(sep) → join(sep, @{arr}). The default `${obj}->{join}`
      // hash-lookup fallback would emit invalid Perl, which is why the
      // IR carves out a dedicated method node instead of routing
      // through the generic call dispatcher. `.join()` defaults the
      // separator to `,` (JS) and ignores any extra argument.
      const obj = emit(object)
      const sep = args.length >= 1 ? emit(args[0]) : `','`
      return `join(${sep}, @{${obj}})`
    }
    case 'includes': {
      // Both `arr.includes(x)` and `str.includes(sub)` route here —
      // the parser can't disambiguate the receiver type. The Mojo
      // runtime's `bf->includes($recv, $elem)` inspects `ref($recv)`
      // and dispatches: ARRAY ref scans the list with `eq`, scalar
      // falls back to `index(..., ...) != -1`. Helper lives in
      // packages/adapter-perl/lib/BarefootJS.pm.
      //
      // The `bf->` (no `$`) form matches every other helper emit —
      // in real Mojolicious `bf` is a controller helper; the
      // standalone test-render in test-render.ts rewrites the bare
      // `bf->` to `$bf->` so both render paths stay consistent.
      const obj = emit(object)
      const needle = emit(args[0])
      return `bf->includes(${obj}, ${needle})`
    }
    case 'indexOf':
    case 'lastIndexOf': {
      // Array `.indexOf(x)` / `.lastIndexOf(x)` value-equality
      // search. The Perl helpers (`bf->index_of`, `bf->last_index_of`)
      // walk the array forward / backward and compare with `eq`
      // (with defined/undef parity). The existing `.find` lowering
      // uses Perl `grep` for struct-field find — disjoint surface,
      // disjoint helpers.
      const fn = method === 'indexOf' ? 'index_of' : 'last_index_of'
      const obj = emit(object)
      const needle = emit(args[0])
      return `bf->${fn}(${obj}, ${needle})`
    }
    case 'at': {
      // `.at(i)` with negative-index support — `.at(-1)` is the
      // last element. The Mojo helper wraps the same `length + i`
      // arithmetic the Go `bf_at` does so the lowering stays
      // symmetric across adapters. `.at()` with no argument is `.at(0)`
      // (the first element); extra arguments are ignored.
      const obj = emit(object)
      const idx = args.length >= 1 ? emit(args[0]) : '0'
      return `bf->at(${obj}, ${idx})`
    }
    case 'concat': {
      // `.concat(other)` merges two arrays. Returns a new ARRAY
      // ref so the result composes with `.join(...)` / other
      // array-shape methods downstream (the canonical Tier A
      // conformance fixture chains `.concat(...).join(' ')`).
      // `.concat()` with no argument is a shallow copy — indistinguishable
      // from the receiver in an SSR snapshot, so it lowers to the receiver.
      if (args.length === 0) {
        return emit(object)
      }
      const a = emit(object)
      const b = emit(args[0])
      return `bf->concat(${a}, ${b})`
    }
    case 'slice': {
      // `.slice()` / `.slice(start)` / `.slice(start, end)`. The Mojo
      // helper mirrors the Go arithmetic (negative-index normalisation,
      // out-of-bounds clamping, empty result on start >= end). A
      // missing `start` defaults to 0 (full copy); an absent `end`
      // lowers as `undef`, which the helper treats as "to length". JS
      // ignores a third+ argument. Returns a new ARRAY ref so the
      // result composes with `.join(...)` downstream.
      const recv = emit(object)
      const start = args.length >= 1 ? emit(args[0]) : '0'
      const end = args.length >= 2 ? emit(args[1]) : 'undef'
      return `bf->slice(${recv}, ${start}, ${end})`
    }
    case 'reverse':
    case 'toReversed': {
      // Both shapes share a lowering — see the parser arm + Go
      // emit for the SSR-mutation-rationale. Returns a new ARRAY
      // ref so the result composes with `.join(...)` downstream.
      const recv = emit(object)
      return `bf->reverse(${recv})`
    }
    case 'toLowerCase': {
      // Perl's native `lc` is the obvious lowering — no helper
      // method needed. The receiver flows through `emit` so any
      // upstream coercion (`$value`, `$bf->string(...)`, etc.)
      // composes naturally.
      const recv = emit(object)
      return `lc(${recv})`
    }
    case 'toUpperCase': {
      // Perl's native `uc` — mirrors `toLowerCase` exactly.
      const recv = emit(object)
      return `uc(${recv})`
    }
    case 'trim': {
      // No Perl native `trim`; route through the `bf->trim`
      // helper so the regex stays in one place (and so an undef
      // receiver doesn't trigger a warning about applying `s///`
      // to undef).
      const recv = emit(object)
      return `bf->trim(${recv})`
    }
    case 'toFixed': {
      // `.toFixed(digits?)` — Number → fixed-decimal string. `bf->to_fixed`
      // mirrors JS rounding + zero-padding (default 0 digits). #1897.
      const recv = emit(object)
      const digits = args.length >= 1 ? emit(args[0]) : '0'
      return `bf->to_fixed(${recv}, ${digits})`
    }
    case 'split': {
      // `.split()` / `.split(sep)` / `.split(sep, limit)` — string →
      // ARRAY ref via `bf->split`. With no separator the helper returns
      // the whole string as a single element; otherwise it quotemetas
      // the separator (literal match, not regex) and keeps trailing
      // empties (`-1`), staying byte-equal with Go's `bf_split`. The
      // optional `limit` caps the pieces; JS ignores a third+ argument.
      // See #1448 Tier B.
      const recv = emit(object)
      if (args.length === 0) {
        return `bf->split(${recv})`
      }
      const sep = emit(args[0])
      if (args.length === 1) {
        return `bf->split(${recv}, ${sep})`
      }
      const limit = emit(args[1])
      return `bf->split(${recv}, ${sep}, ${limit})`
    }
    case 'startsWith':
    case 'endsWith': {
      // `.startsWith(prefix, position?)` / `.endsWith(suffix,
      // endPosition?)` — string → boolean. The Perl helpers
      // (`bf->starts_with` / `bf->ends_with`) do a `substr`-anchored
      // comparison so the search string is matched literally (no regex
      // metachar surprises) and undef receivers stay quiet. The optional
      // second argument re-anchors the test; JS ignores a third+
      // argument. See #1448 Tier B.
      const fn = method === 'startsWith' ? 'starts_with' : 'ends_with'
      const recv = emit(object)
      const arg = emit(args[0])
      if (args.length >= 2) {
        return `bf->${fn}(${recv}, ${arg}, ${emit(args[1])})`
      }
      return `bf->${fn}(${recv}, ${arg})`
    }
    case 'replace': {
      // `.replace(old, new)` — string-pattern form, first occurrence.
      // The `bf->replace` helper splices via index/substr (not `s///`)
      // so both the pattern and the replacement are literal — no Perl
      // regex metacharacters and no `$1` / `$&` interpolation in the
      // replacement, keeping it byte-equal with Go's `bf_replace`. The
      // regex-pattern form is refused upstream at the parser. See
      // #1448 Tier B.
      const recv = emit(object)
      const oldS = emit(args[0])
      const newS = emit(args[1])
      return `bf->replace(${recv}, ${oldS}, ${newS})`
    }
    case 'repeat': {
      // `.repeat(n)` — string repeated `n` times. The `bf->repeat`
      // helper wraps Perl's `x` operator with the same negative-count
      // → "" clamp and integer truncation Go's `bf_repeat` applies, so
      // the two adapters stay byte-equal. Full JS arity: the no-argument
      // form is `repeat(0)` → ""; a second+ argument is ignored.
      // See #1448 Tier B.
      const recv = emit(object)
      const count = args.length === 0 ? '0' : emit(args[0])
      return `bf->repeat(${recv}, ${count})`
    }
    case 'padStart':
    case 'padEnd': {
      // `.padStart(target, pad?)` / `.padEnd(target, pad?)`. The
      // `bf->pad_*` helpers default the pad to a single space when the
      // arg is omitted and measure length in characters, matching Go's
      // rune-based `bf_pad_*`. Full JS arity: the no-argument form is
      // `padStart(0)` → the receiver unchanged; a third+ argument is
      // ignored. See #1448 Tier B.
      const fn = method === 'padStart' ? 'pad_start' : 'pad_end'
      const recv = emit(object)
      if (args.length === 0) {
        return `bf->${fn}(${recv}, 0)`
      }
      const target = emit(args[0])
      if (args.length === 1) {
        return `bf->${fn}(${recv}, ${target})`
      }
      const pad = emit(args[1])
      return `bf->${fn}(${recv}, ${target}, ${pad})`
    }
    default: {
      // TS-level exhaustiveness guard. If this throws at runtime, the
      // IR was constructed against a newer `ArrayMethod` variant that
      // this adapter hasn't been updated for — loud failure is better
      // than emitting a silent empty string downstream.
      const _exhaustive: never = method
      throw new Error(
        `renderArrayMethod: unhandled ArrayMethod '${(_exhaustive as string)}'`,
      )
    }
  }
}

/** Escape a string for embedding in a Perl single-quoted literal. */
function escapePerlSingleQuote(s: string): string {
  // Double every backslash and escape apostrophes: Perl single-quote
  // un-escaping then restores the original bytes (a JSON `\\` must reach
  // `JSON::PP->decode` as `\\`, so it travels as `\\\\` in the literal).
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * Build the `base_env` hashref argument for an evaluator call: the
 * comparator / reducer body's free variables (body idents minus the
 * callback params), each materialised to its SSR value via `emit`. An
 * empty capture set yields `{}` — the runtime's seed-once env.
 */
function emitEvalEnvArg(
  body: ParsedExpr,
  params: string[],
  emit: (e: ParsedExpr) => string,
): string {
  const free = freeVarsInBody(body, new Set(params))
  if (free.length === 0) return '{}'
  const pairs = free.map(
    n => `'${escapePerlSingleQuote(n)}' => ${emit({ kind: 'identifier', name: n })}`,
  )
  return `{ ${pairs.join(', ')} }`
}

/**
 * Emit a `.sort(cmp)` / `.toSorted(cmp)` via the runtime evaluator (#2018):
 * the comparator body travels as serialized-ParsedExpr JSON, evaluated per
 * comparison against `{paramA, paramB, …captured}`. Returns null when the
 * body can't be evaluated (e.g. a `localeCompare` comparator —
 * `serializeParsedExpr` refuses it), so the caller falls back to the
 * structured `bf->sort`. A `||`-chained multi-key comparator needs no
 * special handling — JS `0 || next` is exactly the tie-break semantics.
 */
export function renderSortEval(
  recv: string,
  c: SortComparator,
  emit: (e: ParsedExpr) => string,
): string | null {
  const body = parseExpression(c.raw)
  const json = serializeParsedExpr(body)
  if (json === null) return null
  const env = emitEvalEnvArg(body, [c.paramA, c.paramB], emit)
  return `bf->sort_eval(${recv}, '${escapePerlSingleQuote(json)}', '${c.paramA}', '${c.paramB}', ${env})`
}

/**
 * Emit a `.reduce(fn, init)` / `.reduceRight(fn, init)` via the runtime
 * evaluator (#2018): the reducer body travels as serialized-ParsedExpr JSON,
 * folded over the receiver from `init` in `direction` order. Returns null when
 * the body can't be evaluated (→ caller falls back to `bf->reduce`). A numeric
 * seed passes through as a bare Perl number; a concat seed as a single-quoted
 * string.
 */
export function renderReduceEval(
  recv: string,
  op: ReduceOp,
  direction: 'left' | 'right',
  emit: (e: ParsedExpr) => string,
): string | null {
  const body = parseExpression(op.raw)
  const json = serializeParsedExpr(body)
  if (json === null) return null
  const env = emitEvalEnvArg(body, [op.paramAcc, op.paramItem], emit)
  const init =
    op.type === 'string'
      ? `'${escapePerlSingleQuote(op.init)}'`
      : op.init
  return `bf->reduce_eval(${recv}, '${escapePerlSingleQuote(json)}', '${op.paramAcc}', '${op.paramItem}', ${init}, '${direction}', ${env})`
}

/**
 * Emit a higher-order predicate call via the runtime evaluator (#2018, P2):
 * `bf->filter_eval` / `bf->every_eval` / `bf->some_eval` / `bf->find_eval` /
 * `bf->find_index_eval`, carrying the serialized predicate body + captured env
 * hashref. Generalizes the inline `grep` / `bf->find` lowering to the same
 * JS-faithful evaluator the Go adapter uses (cross-adapter isomorphism).
 * Returns null when the predicate is outside the evaluator surface (e.g. a
 * method-call predicate — `serializeParsedExpr` refuses it), so the caller
 * falls back to the `grep` / `bf->find` form. `forward` (find / findIndex
 * family only) selects the search direction — `false` = findLast /
 * findLastIndex.
 */
export function renderPredicateEval(
  funcName: string,
  recv: string,
  predicate: ParsedExpr,
  param: string,
  emit: (e: ParsedExpr) => string,
  forward?: boolean,
): string | null {
  const json = serializeParsedExpr(predicate)
  if (json === null) return null
  const env = emitEvalEnvArg(predicate, [param], emit)
  const fwd = forward === undefined ? '' : `, ${forward ? 1 : 0}`
  return `bf->${funcName}(${recv}, '${escapePerlSingleQuote(json)}', '${param}'${fwd}, ${env})`
}

/**
 * Shared Mojo emit for `.sort(cmp)` / `.toSorted(cmp)` (#1448 Tier B).
 * Used by both the filter-context emitter and the top-level emitter,
 * plus the loop-hoist path in `renderLoop` — same emit shape across
 * all three so a regression in any one path surfaces consistently.
 *
 * The Perl helper accepts a hash-ref opts bag whose `keys` entry is
 * an ordered list of per-key hashes (room for a future `nulls` knob
 * without arity churn), and returns a fresh ARRAY ref so downstream
 * composition (`@{bf->sort(...)}` in `join(...)`, etc.) stays
 * straightforward.
 */
export function renderSortMethod(recv: string, c: SortComparator): string {
  // One hash per comparison key, in priority order, under `keys`. A
  // simple comparator yields a one-element list; a `||`-chained
  // multi-key comparator yields one per operand. `bf->sort` walks them
  // in order, falling through to the next on a tie.
  const keyHashes = c.keys.map((k) => {
    const keyEntry =
      k.key.kind === 'self'
        ? `key_kind => 'self'`
        : `key_kind => 'field', key => '${k.key.field}'`
    return `{ ${keyEntry}, compare_type => '${k.type}', direction => '${k.direction}' }`
  })
  return `bf->sort(${recv}, { keys => [${keyHashes.join(', ')}] })`
}

/**
 * Render a `.reduce(fn, init)` arithmetic fold (#1448 Tier C) as a
 * `bf->reduce(...)` call. The structured `ReduceOp` maps to the Perl
 * helper's options hash:
 *
 *   bf->reduce($recv, { op => '+', key_kind => 'field', key => 'duration',
 *                       type => 'numeric', init => 0 })
 *
 * A numeric init passes through as a bare Perl number (`0`, `-1`); a
 * string init (concat fold) is re-quoted from its literal contents.
 */
export function renderReduceMethod(recv: string, op: ReduceOp, direction: 'left' | 'right'): string {
  const keyEntry =
    op.key.kind === 'self'
      ? `key_kind => 'self'`
      : `key_kind => 'field', key => '${op.key.field}'`
  // `op.init` is the decoded seed value. A numeric seed is already a
  // canonical decimal literal Perl reads directly; a concat seed is the
  // string contents, embedded in a single-quoted Perl literal. The `'`
  // escape is REQUIRED: a seed decoded from a double-quoted JS literal
  // (e.g. `"a'b"`) is escape-free yet contains an apostrophe. A literal
  // backslash can't occur (it would need a `\\` escape, which the parser
  // refuses), but escaping it too keeps this self-contained.
  const init =
    op.type === 'string'
      ? `'${op.init.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
      : op.init
  // `direction` is "left" (reduce) or "right" (reduceRight); the Perl
  // helper reverses the list for "right". Only observable for concat.
  return `bf->reduce(${recv}, { op => '${op.op}', ${keyEntry}, type => '${op.type}', init => ${init}, direction => '${direction}' })`
}

// `.flat(depth?)` → `bf->flat($recv, $depth)`. The `Infinity` form lowers
// to the `-1` sentinel (flatten fully); a finite depth flattens that many
// levels (`0` = shallow copy). See `sub flat` in BarefootJS.pm. (#1448)
export function renderFlatMethod(recv: string, depth: FlatDepth): string {
  const d = depth === 'infinity' ? -1 : depth
  return `bf->flat(${recv}, ${d})`
}

// `.flatMap(i => i)` / `.flatMap(i => i.field)` → `bf->flat_map($recv,
// 'self'|'field', 'field')`, and the array-literal tuple form
// `i => [i.a, i.b]` → `bf->flat_map_tuple($recv, ['field','a'], ...)`
// (one arrayref per leaf). The field key is the raw JS prop name (Perl
// hashes are keyed by it), mirroring `bf->reduce`. See `sub flat_map` /
// `sub flat_map_tuple` in BarefootJS.pm.
export function renderFlatMapMethod(recv: string, op: FlatMapOp): string {
  const proj = op.projection
  if (proj.kind === 'tuple') {
    const specs = proj.elements
      .map(l => (l.kind === 'self' ? `['self', '']` : `['field', '${l.field}']`))
      .join(', ')
    return `bf->flat_map_tuple(${recv}, ${specs})`
  }
  if (proj.kind === 'self') return `bf->flat_map(${recv}, 'self', '')`
  return `bf->flat_map(${recv}, 'field', '${proj.field}')`
}
