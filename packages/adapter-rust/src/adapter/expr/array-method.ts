/**
 * Array / string method lowering for the minijinja template adapter.
 *
 * Ported from `packages/adapter-xslate/src/adapter/expr/array-method.ts`.
 * Pure free functions shared by both the filter-context emitter and the
 * top-level emitter — they take an `emit` callback for receiver / argument
 * recursion and read no adapter instance state.
 *
 * The receiver/array helpers are the same runtime methods the Xslate adapter
 * calls, invoked as `bf.NAME(...)` (bare, no `$` sigil) instead of
 * `$bf.NAME(...)`.
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
import { escapeMinijinjaSingleQuoted, minijinjaHashKey } from '../lib/minijinja-naming.ts'

export function renderArrayMethod(
  method: ArrayMethod,
  object: ParsedExpr,
  args: ParsedExpr[],
  emit: (e: ParsedExpr) => string,
): string {
  switch (method) {
    case 'join': {
      // Route through the runtime (`bf.join`) rather than a Jinja/Python
      // builtin, so the JS-compat element handling (undef → empty, default
      // separator) is applied consistently.
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
      // Jinja's undefined-literal is `none`, not Kolon's `nil` — the runtime
      // `slice` treats it as "to end".
      const end = args.length >= 2 ? emit(args[1]) : 'none'
      return `bf.slice(${recv}, ${start}, ${end})`
    }
    case 'reverse':
    case 'toReversed': {
      const recv = emit(object)
      return `bf.reverse(${recv})`
    }
    case 'toLowerCase': {
      // Route through the runtime (consistent with bf.includes / bf.slice /
      // etc.) rather than a bare `.lower()` filter, so a non-string operand
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
    n => `${minijinjaHashKey(n)}: ${emit({ kind: 'identifier', name: n })}`,
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
  // (mirrors the Go / Xslate guards).
  if (params.length < 2) return null
  const [paramA, paramB] = params
  const env = emitEvalEnvArg(body, params, emit)
  return `bf.sort_eval(${recv}, '${escapeMinijinjaSingleQuoted(json)}', '${paramA}', '${paramB}', ${env})`
}

/**
 * Emit a `.reduce(fn, init)` / `.reduceRight(fn, init)` via the runtime
 * evaluator (#2018): the reducer body travels as serialized-ParsedExpr JSON,
 * folded over the receiver from `init` in `direction` order. `params` are the
 * reducer arrow's params (`[paramAcc, paramItem]`); `init` is the initial-value
 * `ParsedExpr` from the call's trailing argument. Returns null when the body is
 * outside the evaluator surface, or when `init` is not a literal string/number
 * (→ caller refuses with BF101). A numeric seed passes through as a bare
 * Jinja number; a string seed as a single-quoted literal.
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
      ? `'${escapeMinijinjaSingleQuoted(String(init.value))}'`
      : init.literalType === 'number'
        ? String(init.value)
        : null
  if (initOut === null) return null
  // A reducer needs both the accumulator and element param; refuse a
  // wrong-arity arrow cleanly (→ BF101) rather than emitting an 'undefined'
  // param name (mirrors the Go / Xslate guards).
  if (params.length < 2) return null
  const [paramAcc, paramItem] = params
  const env = emitEvalEnvArg(body, params, emit)
  return `bf.reduce_eval(${recv}, '${escapeMinijinjaSingleQuoted(json)}', '${paramAcc}', '${paramItem}', ${initOut}, '${direction}', ${env})`
}

/**
 * Emit a higher-order predicate call via the runtime evaluator (#2018, P2):
 * `bf.filter_eval` / `bf.every_eval` / `bf.some_eval` / `bf.find_eval` /
 * `bf.find_index_eval`, carrying the serialized predicate body + captured env
 * dict. Generalizes the lambda lowering to the same JS-faithful evaluator
 * the Go/Xslate adapters use. Returns null when the predicate is outside the
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
  return `bf.${funcName}(${recv}, '${escapeMinijinjaSingleQuoted(json)}', '${param}'${fwd}, ${env})`
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
  return `bf.flat_map_eval(${recv}, '${escapeMinijinjaSingleQuoted(json)}', '${param}', ${env})`
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
  return `bf.map_eval(${recv}, '${escapeMinijinjaSingleQuoted(json)}', '${param}', ${env})`
}

/**
 * Shared Jinja emit for `.sort(cmp)` / `.toSorted(cmp)`. Used by both the
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
    // Dynamic depth (#2094): the EMIT path is wired up in this phase so the
    // shared `flatMethod` interface compiles everywhere, but the RUNTIME
    // coercion (JS `ToIntegerOrInfinity`) for this backend is Phase 2 — the
    // existing helper below still assumes a pre-normalised int depth (its
    // `-1` argument means "flatten fully", the compile-time Infinity
    // sentinel), so a dynamic depth that is negative, fractional, or
    // itself `Infinity`-like won't match JS semantics until the runtime
    // helper is updated to coerce it (see the `depthExpr` doc in
    // expression-parser.ts and the Go reference implementation).
    return `bf.flat(${recv}, ${emit(depth.expr)})`
  }
  const d = depth === 'infinity' ? -1 : depth
  return `bf.flat(${recv}, ${d})`
}
