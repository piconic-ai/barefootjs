/**
 * Array / string method lowering for the Text::Xslate (Kolon) template adapter.
 *
 * Extracted from `xslate-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure free functions shared by both the filter-context emitter and
 * the top-level emitter — they take an `emit` callback for receiver / argument
 * recursion and read no adapter instance state.
 *
 * The receiver/array helpers are the same runtime methods the Mojo adapter
 * calls, invoked as `$bf.NAME(...)` on the Kolon `$bf` object instead of
 * `bf->NAME`.
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

export function renderArrayMethod(
  method: ArrayMethod,
  object: ParsedExpr,
  args: ParsedExpr[],
  emit: (e: ParsedExpr) => string,
): string {
  switch (method) {
    case 'join': {
      // Route through the runtime (`$bf.join`) rather than Kolon's builtin
      // `.join`, so the JS-compat element handling (undef → empty, default
      // separator) is applied consistently — same reasoning as $bf.lc / etc.
      const obj = emit(object)
      const sep = args.length >= 1 ? emit(args[0]) : `','`
      return `$bf.join(${obj}, ${sep})`
    }
    case 'includes': {
      const obj = emit(object)
      const needle = emit(args[0])
      return `$bf.includes(${obj}, ${needle})`
    }
    case 'indexOf':
    case 'lastIndexOf': {
      const fn = method === 'indexOf' ? 'index_of' : 'last_index_of'
      const obj = emit(object)
      const needle = emit(args[0])
      return `$bf.${fn}(${obj}, ${needle})`
    }
    case 'at': {
      const obj = emit(object)
      const idx = args.length >= 1 ? emit(args[0]) : '0'
      return `$bf.at(${obj}, ${idx})`
    }
    case 'concat': {
      if (args.length === 0) {
        return emit(object)
      }
      const a = emit(object)
      const b = emit(args[0])
      return `$bf.concat(${a}, ${b})`
    }
    case 'slice': {
      const recv = emit(object)
      const start = args.length >= 1 ? emit(args[0]) : '0'
      // Kolon's undefined literal is `nil`, not Perl's `undef` — the
      // runtime `slice` treats it as "to end".
      const end = args.length >= 2 ? emit(args[1]) : 'nil'
      return `$bf.slice(${recv}, ${start}, ${end})`
    }
    case 'reverse':
    case 'toReversed': {
      const recv = emit(object)
      return `$bf.reverse(${recv})`
    }
    case 'toLowerCase': {
      // Kolon has no builtin string `lc` / `uc`, so these go through the
      // runtime object (consistent with $bf.includes / $bf.slice / etc.).
      const recv = emit(object)
      return `$bf.lc(${recv})`
    }
    case 'toUpperCase': {
      const recv = emit(object)
      return `$bf.uc(${recv})`
    }
    case 'trim': {
      const recv = emit(object)
      return `$bf.trim(${recv})`
    }
    case 'toFixed': {
      // `.toFixed(digits?)` — `$bf.to_fixed` mirrors JS rounding +
      // zero-padding (default 0 digits). #1897.
      const recv = emit(object)
      const digits = args.length >= 1 ? emit(args[0]) : '0'
      return `$bf.to_fixed(${recv}, ${digits})`
    }
    case 'split': {
      const recv = emit(object)
      if (args.length === 0) {
        return `$bf.split(${recv})`
      }
      const sep = emit(args[0])
      if (args.length === 1) {
        return `$bf.split(${recv}, ${sep})`
      }
      const limit = emit(args[1])
      return `$bf.split(${recv}, ${sep}, ${limit})`
    }
    case 'startsWith':
    case 'endsWith': {
      const fn = method === 'startsWith' ? 'starts_with' : 'ends_with'
      const recv = emit(object)
      const arg = emit(args[0])
      if (args.length >= 2) {
        return `$bf.${fn}(${recv}, ${arg}, ${emit(args[1])})`
      }
      return `$bf.${fn}(${recv}, ${arg})`
    }
    case 'replace': {
      const recv = emit(object)
      const oldS = emit(args[0])
      const newS = emit(args[1])
      return `$bf.replace(${recv}, ${oldS}, ${newS})`
    }
    case 'repeat': {
      const recv = emit(object)
      const count = args.length === 0 ? '0' : emit(args[0])
      return `$bf.repeat(${recv}, ${count})`
    }
    case 'padStart':
    case 'padEnd': {
      const fn = method === 'padStart' ? 'pad_start' : 'pad_end'
      const recv = emit(object)
      if (args.length === 0) {
        return `$bf.${fn}(${recv}, 0)`
      }
      const target = emit(args[0])
      if (args.length === 1) {
        return `$bf.${fn}(${recv}, ${target})`
      }
      const pad = emit(args[1])
      return `$bf.${fn}(${recv}, ${target}, ${pad})`
    }
    default: {
      // TS-level exhaustiveness guard.
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
 * body is outside the evaluator surface (e.g. a `localeCompare` comparator —
 * `serializeParsedExpr` refuses it), so the caller falls back to the
 * structured `$bf.sort`.
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
  return `$bf.sort_eval(${recv}, '${escapePerlSingleQuote(json)}', '${c.paramA}', '${c.paramB}', ${env})`
}

/**
 * Emit a `.reduce(fn, init)` / `.reduceRight(fn, init)` via the runtime
 * evaluator (#2018): the reducer body travels as serialized-ParsedExpr JSON,
 * folded over the receiver from `init` in `direction` order. Returns null when
 * the body is outside the evaluator surface (→ caller falls back to
 * `$bf.reduce`). A numeric seed passes through as a bare Perl number; a concat
 * seed as a single-quoted string.
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
  return `$bf.reduce_eval(${recv}, '${escapePerlSingleQuote(json)}', '${op.paramAcc}', '${op.paramItem}', ${init}, '${direction}', ${env})`
}

/**
 * Emit a higher-order predicate call via the runtime evaluator (#2018, P2):
 * `$bf.filter_eval` / `$bf.every_eval` / `$bf.some_eval` / `$bf.find_eval` /
 * `$bf.find_index_eval`, carrying the serialized predicate body + captured env
 * hashref. Generalizes the Kolon-lambda `$bf.filter` lowering to the same
 * JS-faithful evaluator the Go adapter uses (cross-adapter isomorphism).
 * Returns null when the predicate is outside the evaluator surface (e.g. a
 * method-call predicate — `serializeParsedExpr` refuses it), so the caller
 * falls back to the lambda form. `forward` (find / findIndex family only)
 * selects the search direction — `false` = findLast / findLastIndex.
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
  return `$bf.${funcName}(${recv}, '${escapePerlSingleQuote(json)}', '${param}'${fwd}, ${env})`
}

/**
 * Emit a `.flatMap(proj)` via the runtime evaluator (#2018, P3): the projection
 * body (`FlatMapOp.raw`) serializes to JSON and `$bf.flat_map_eval` projects +
 * flattens one level. Returns null when the projection is outside the evaluator
 * surface (→ caller falls back to the structured `$bf.flat_map`).
 */
export function renderFlatMapEval(
  recv: string,
  op: FlatMapOp,
  emit: (e: ParsedExpr) => string,
): string | null {
  const body = parseExpression(op.raw)
  const json = serializeParsedExpr(body)
  if (json === null) return null
  const env = emitEvalEnvArg(body, [op.param], emit)
  return `$bf.flat_map_eval(${recv}, '${escapePerlSingleQuote(json)}', '${op.param}', ${env})`
}

/**
 * Shared Kolon emit for `.sort(cmp)` / `.toSorted(cmp)`. Used by both the
 * filter-context emitter and the top-level emitter, plus the loop-array
 * wrap in `renderLoop`. The runtime `$bf.sort` accepts a hashref opts bag and
 * returns a fresh array ref.
 */
export function renderSortMethod(recv: string, c: SortComparator): string {
  const keyHashes = c.keys.map((k) => {
    const keyEntry =
      k.key.kind === 'self'
        ? `key_kind => 'self'`
        : `key_kind => 'field', key => '${k.key.field}'`
    return `{ ${keyEntry}, compare_type => '${k.type}', direction => '${k.direction}' }`
  })
  return `$bf.sort(${recv}, { keys => [${keyHashes.join(', ')}] })`
}

/**
 * Render a `.reduce(fn, init)` arithmetic fold as a `$bf.reduce(...)` call.
 */
export function renderReduceMethod(recv: string, op: ReduceOp, direction: 'left' | 'right'): string {
  const keyEntry =
    op.key.kind === 'self'
      ? `key_kind => 'self'`
      : `key_kind => 'field', key => '${op.key.field}'`
  const init =
    op.type === 'string'
      ? `'${op.init.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
      : op.init
  return `$bf.reduce(${recv}, { op => '${op.op}', ${keyEntry}, type => '${op.type}', init => ${init}, direction => '${direction}' })`
}

// `.flat(depth?)` → `$bf.flat($recv, $depth)`.
export function renderFlatMethod(recv: string, depth: FlatDepth): string {
  const d = depth === 'infinity' ? -1 : depth
  return `$bf.flat(${recv}, ${d})`
}

// `.flatMap(...)` → `$bf.flat_map(...)` / `$bf.flat_map_tuple(...)`.
export function renderFlatMapMethod(recv: string, op: FlatMapOp): string {
  const proj = op.projection
  if (proj.kind === 'tuple') {
    const specs = proj.elements
      .map(l => (l.kind === 'self' ? `['self', '']` : `['field', '${l.field}']`))
      .join(', ')
    return `$bf.flat_map_tuple(${recv}, ${specs})`
  }
  if (proj.kind === 'self') return `$bf.flat_map(${recv}, 'self', '')`
  return `$bf.flat_map(${recv}, 'field', '${proj.field}')`
}
