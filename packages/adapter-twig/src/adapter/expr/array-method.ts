/**
 * Array / string method lowering for the Twig template adapter.
 *
 * Ported from `packages/adapter-jinja/src/adapter/expr/array-method.ts`.
 * Pure free functions shared by both the filter-context emitter and the
 * top-level emitter — they take an `emit` callback for receiver / argument
 * recursion and read no adapter instance state.
 *
 * The receiver/array helpers are the same runtime methods the Jinja adapter
 * calls, invoked as `bf.NAME(...)`.
 */

import {
  serializeParsedExpr,
  freeVarsInBody,
} from '@barefootjs/jsx'
import type {
  ParsedExpr,
  ArrayMethod,
  SortComparator,
  FlatDepth,
} from '@barefootjs/jsx'
import { escapeTwigSingleQuoted, twigHashKey } from '../lib/twig-naming.ts'

export function renderArrayMethod(
  method: ArrayMethod,
  object: ParsedExpr,
  args: ParsedExpr[],
  emit: (e: ParsedExpr) => string,
): string {
  switch (method) {
    case 'join': {
      // Route through the runtime (`bf.join`) rather than a Twig builtin, so
      // the JS-compat element handling (undef → empty, default separator) is
      // applied consistently.
      const obj = emit(object)
      const sep = args.length >= 1 ? emit(args[0]) : `','`
      return `bf.join(${obj}, ${sep})`
    }
    case 'includes': {
      const obj = emit(object)
      const needle = emit(args[0])
      return `bf.includes(${obj}, ${needle})`
    }
    case 'indexOf':
    case 'lastIndexOf': {
      const fn = method === 'indexOf' ? 'index_of' : 'last_index_of'
      const obj = emit(object)
      const needle = emit(args[0])
      return `bf.${fn}(${obj}, ${needle})`
    }
    case 'at': {
      const obj = emit(object)
      const idx = args.length >= 1 ? emit(args[0]) : '0'
      return `bf.at(${obj}, ${idx})`
    }
    case 'concat': {
      if (args.length === 0) {
        return emit(object)
      }
      const a = emit(object)
      const b = emit(args[0])
      return `bf.concat(${a}, ${b})`
    }
    case 'slice': {
      const recv = emit(object)
      const start = args.length >= 1 ? emit(args[0]) : '0'
      // Twig's undefined-literal is `null`, not Kolon's `nil` or Jinja's
      // `none` — the runtime `slice` treats it as "to end".
      const end = args.length >= 2 ? emit(args[1]) : 'null'
      return `bf.slice(${recv}, ${start}, ${end})`
    }
    case 'reverse':
    case 'toReversed': {
      const recv = emit(object)
      return `bf.reverse(${recv})`
    }
    case 'toLowerCase': {
      // Route through the runtime (consistent with bf.includes / bf.slice /
      // etc.) rather than a bare `|lower` filter, so a non-string operand
      // still gets JS-compatible coercion first.
      const recv = emit(object)
      return `bf.lc(${recv})`
    }
    case 'toUpperCase': {
      const recv = emit(object)
      return `bf.uc(${recv})`
    }
    case 'trim': {
      const recv = emit(object)
      return `bf.trim(${recv})`
    }
    case 'toFixed': {
      // `.toFixed(digits?)` — `bf.to_fixed` mirrors JS rounding +
      // zero-padding (default 0 digits). #1897.
      const recv = emit(object)
      const digits = args.length >= 1 ? emit(args[0]) : '0'
      return `bf.to_fixed(${recv}, ${digits})`
    }
    case 'split': {
      const recv = emit(object)
      if (args.length === 0) {
        return `bf.split(${recv})`
      }
      const sep = emit(args[0])
      if (args.length === 1) {
        return `bf.split(${recv}, ${sep})`
      }
      const limit = emit(args[1])
      return `bf.split(${recv}, ${sep}, ${limit})`
    }
    case 'startsWith':
    case 'endsWith': {
      const fn = method === 'startsWith' ? 'starts_with' : 'ends_with'
      const recv = emit(object)
      const arg = emit(args[0])
      if (args.length >= 2) {
        return `bf.${fn}(${recv}, ${arg}, ${emit(args[1])})`
      }
      return `bf.${fn}(${recv}, ${arg})`
    }
    case 'replace': {
      const recv = emit(object)
      const oldS = emit(args[0])
      const newS = emit(args[1])
      return `bf.replace(${recv}, ${oldS}, ${newS})`
    }
    case 'replaceAll': {
      // `.replaceAll(old, new)` — string-pattern form, EVERY occurrence,
      // via the dedicated `bf.replace_all` helper (not `bf.replace` with
      // a flag) — the regex-pattern form is refused upstream at the
      // parser, same as `.replace`. See #2182.
      const recv = emit(object)
      const oldS = emit(args[0])
      const newS = emit(args[1])
      return `bf.replace_all(${recv}, ${oldS}, ${newS})`
    }
    case 'repeat': {
      const recv = emit(object)
      const count = args.length === 0 ? '0' : emit(args[0])
      return `bf.repeat(${recv}, ${count})`
    }
    case 'padStart':
    case 'padEnd': {
      const fn = method === 'padStart' ? 'pad_start' : 'pad_end'
      const recv = emit(object)
      if (args.length === 0) {
        return `bf.${fn}(${recv}, 0)`
      }
      const target = emit(args[0])
      if (args.length === 1) {
        return `bf.${fn}(${recv}, ${target})`
      }
      const pad = emit(args[1])
      return `bf.${fn}(${recv}, ${target}, ${pad})`
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

/**
 * Build the `base_env` dict argument for an evaluator call: the
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
    n => `${twigHashKey(n)}: ${emit({ kind: 'identifier', name: n })}`,
  )
  return `{${pairs.join(', ')}}`
}

/**
 * Emit a `.sort(cmp)` / `.toSorted(cmp)` via the runtime evaluator (#2018):
 * the comparator body travels as serialized-ParsedExpr JSON, evaluated per
 * comparison against `{paramA, paramB, …captured}`. Returns null when the
 * body is outside the evaluator surface (e.g. a `localeCompare` comparator —
 * `serializeParsedExpr` refuses it), so the caller falls back to the
 * structured `bf.sort`. `params` are the comparator arrow's two params
 * (`[paramA, paramB]`).
 */
export function renderSortEval(
  recv: string,
  body: ParsedExpr,
  params: string[],
  emit: (e: ParsedExpr) => string,
): string | null {
  const json = serializeParsedExpr(body)
  if (json === null) return null
  // A comparator needs both params; a wrong-arity arrow would emit an
  // 'undefined' param name, so fail over to the structured fallback / BF101
  // (mirrors the Go / Jinja guards).
  if (params.length < 2) return null
  const [paramA, paramB] = params
  const env = emitEvalEnvArg(body, params, emit)
  return `bf.sort_eval(${recv}, '${escapeTwigSingleQuoted(json)}', '${paramA}', '${paramB}', ${env})`
}

/**
 * Emit a `.reduce(fn, init)` / `.reduceRight(fn, init)` via the runtime
 * evaluator (#2018): the reducer body travels as serialized-ParsedExpr JSON,
 * folded over the receiver from `init` in `direction` order. `params` are the
 * reducer arrow's params (`[paramAcc, paramItem]`); `init` is the initial-value
 * `ParsedExpr` from the call's trailing argument. Returns null when the body is
 * outside the evaluator surface, or when `init` is not a literal string/number
 * (→ caller refuses with BF101). A numeric seed passes through as a bare
 * Twig number; a string seed as a single-quoted literal.
 */
export function renderReduceEval(
  recv: string,
  body: ParsedExpr,
  params: string[],
  init: ParsedExpr,
  direction: 'left' | 'right',
  emit: (e: ParsedExpr) => string,
): string | null {
  const json = serializeParsedExpr(body)
  if (json === null) return null
  if (init.kind !== 'literal') return null
  const initOut =
    init.literalType === 'string'
      ? `'${escapeTwigSingleQuoted(String(init.value))}'`
      : init.literalType === 'number'
        ? String(init.value)
        : null
  if (initOut === null) return null
  // A reducer needs both the accumulator and element param; refuse a
  // wrong-arity arrow cleanly (→ BF101) rather than emitting an 'undefined'
  // param name (mirrors the Go / Jinja guards).
  if (params.length < 2) return null
  const [paramAcc, paramItem] = params
  const env = emitEvalEnvArg(body, params, emit)
  return `bf.reduce_eval(${recv}, '${escapeTwigSingleQuoted(json)}', '${paramAcc}', '${paramItem}', ${initOut}, '${direction}', ${env})`
}

/**
 * Emit a higher-order predicate call via the runtime evaluator (#2018, P2):
 * `bf.filter_eval` / `bf.every_eval` / `bf.some_eval` / `bf.find_eval` /
 * `bf.find_index_eval`, carrying the serialized predicate body + captured env
 * dict. Generalizes the lambda lowering to the same JS-faithful evaluator
 * the Go/Jinja adapters use. Returns null when the predicate is outside the
 * evaluator surface (e.g. a method-call predicate — `serializeParsedExpr`
 * refuses it), so the caller falls back to the lambda form. `forward`
 * (find / findIndex family only) selects the search direction — `false` =
 * findLast / findLastIndex.
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
  const fwd = forward === undefined ? '' : `, ${forward ? 'true' : 'false'}`
  return `bf.${funcName}(${recv}, '${escapeTwigSingleQuoted(json)}', '${param}'${fwd}, ${env})`
}

/**
 * Emit a `.flatMap(proj)` via the runtime evaluator (#2018, P3): the projection
 * body serializes to JSON and `bf.flat_map_eval` projects + flattens one
 * level. `param` is the projection arrow's single param. Returns null when the
 * projection is outside the evaluator surface (→ caller refuses with BF101).
 */
export function renderFlatMapEval(
  recv: string,
  body: ParsedExpr,
  param: string,
  emit: (e: ParsedExpr) => string,
): string | null {
  const json = serializeParsedExpr(body)
  if (json === null) return null
  const env = emitEvalEnvArg(body, [param], emit)
  return `bf.flat_map_eval(${recv}, '${escapeTwigSingleQuoted(json)}', '${param}', ${env})`
}

/**
 * Emit a value-producing `.map(cb)` via the runtime evaluator (#2073): the
 * projection body serializes to JSON and `bf.map_eval` projects each element,
 * one result per element (no flatten — the JS `.map` contract). Composes
 * through the array-method chain (`.map(cb).join(' ')`). Returns null when
 * the projection is outside the evaluator surface (→ caller refuses with
 * BF101). The JSX-returning `.map` is an IRLoop upstream and never reaches
 * this emit.
 */
export function renderMapEval(
  recv: string,
  body: ParsedExpr,
  param: string,
  emit: (e: ParsedExpr) => string,
): string | null {
  const json = serializeParsedExpr(body)
  if (json === null) return null
  const env = emitEvalEnvArg(body, [param], emit)
  return `bf.map_eval(${recv}, '${escapeTwigSingleQuoted(json)}', '${param}', ${env})`
}

/**
 * Shared Twig emit for `.sort(cmp)` / `.toSorted(cmp)`. Used by both the
 * filter-context emitter and the top-level emitter, plus the loop-array
 * wrap in `renderLoop`. The runtime `bf.sort` accepts an opts dict and
 * returns a fresh list.
 */
export function renderSortMethod(recv: string, c: SortComparator): string {
  const keyDicts = c.keys.map((k) => {
    const keyEntry =
      k.key.kind === 'self'
        ? `'key_kind': 'self'`
        : `'key_kind': 'field', 'key': '${k.key.field}'`
    return `{${keyEntry}, 'compare_type': '${k.type}', 'direction': '${k.direction}'}`
  })
  return `bf.sort(${recv}, {'keys': [${keyDicts.join(', ')}]})`
}

// `.flat(depth?)` → `bf.flat(recv, depth)`.
export function renderFlatMethod(
  recv: string,
  depth: FlatDepth | { expr: ParsedExpr },
  emit: (e: ParsedExpr) => string,
): string {
  if (typeof depth === 'object') {
    // Dynamic depth (#2094): routed to a distinct runtime helper,
    // `bf.flat_dynamic`, rather than reusing `bf.flat`. The literal-depth
    // path (`bf.flat`) bakes `-1` in as a compile-time SENTINEL meaning "the
    // source literally said `Infinity`". A genuinely dynamic depth value
    // that happens to evaluate to `-1` at render time means the OPPOSITE in
    // real JS (`[1,[2]].flat(-1)` never recurses — same as `.flat(0)`).
    // Since both paths would otherwise hand the same literal-looking `-1`
    // argument to one shared function, that function cannot tell which case
    // it's in — so it must be two different runtime entry points.
    // `bf.flat_dynamic` performs the JS `ToIntegerOrInfinity` coercion on its
    // second argument at render time (truncate toward zero; negative → 0;
    // NaN/non-numeric → 0; +Infinity or a huge finite value → flatten
    // fully) before delegating to the same recursive flattening as `flat`.
    return `bf.flat_dynamic(${recv}, ${emit(depth.expr)})`
  }
  const d = depth === 'infinity' ? -1 : depth
  return `bf.flat(${recv}, ${d})`
}
