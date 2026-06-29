/**
 * Go html/template emit helpers: string escaping, argument wrapping, `bf_*`
 * runtime-helper call construction, and JSX-literal → Go-literal lowering.
 * Pure free functions — none read adapter instance state.
 */

import type { SortComparator, SupportResult, ParsedExpr } from '@barefootjs/jsx'
import { serializeParsedExpr, freeVarsInBody } from '@barefootjs/jsx'

import { capitalize } from "./go-naming.ts"

/** Escape a value for embedding in a Go-template double-quoted string. */
export function escapeGoString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Wrap a rendered Go template fragment in parens when it would otherwise parse
 * as multiple sibling args of an enclosing prefix call. A bare identifier /
 * dotted path / quoted literal stays uncluttered; anything containing
 * whitespace (a call, `len ...`) gets `(...)` so `bf_join (...) bf_trim .Raw`
 * doesn't degrade to four args of `bf_join`.
 */
export function wrapIfMultiToken(rendered: string): string {
  if (rendered.startsWith('(') && rendered.endsWith(')')) return rendered
  // Quoted literals may contain spaces but parse as one token — leave alone.
  if (rendered.startsWith('"') && rendered.endsWith('"')) return rendered
  if (/\s/.test(rendered)) return `(${rendered})`
  return rendered
}

/**
 * Parenthesize a compound Go template argument (`or .Checked false`) so a
 * primitive call reads it as ONE argument — unwrapped, the parser splits it
 * into three and `bf_string` fails with "want 1 got 3".
 */
export function wrapGoArg(arg: string): string {
  if (!/\s/.test(arg)) return arg
  if (arg.startsWith('(') && arg.endsWith(')')) return arg
  return `(${arg})`
}

/**
 * Emit the `bf_sort` call:
 *
 *   bf_sort <recv> (<keyKind> <keyName> <compareType> <direction>)+
 *
 *   keyKind:      "self" | "field"
 *   keyName:      "" when keyKind=self; capitalised field name otherwise
 *   compareType:  "numeric" | "string" | "auto"
 *   direction:    "asc" | "desc"
 *
 * The 4-string group repeats once per comparison key: a simple comparator emits
 * one group; a `||`-chained multi-key comparator emits one per operand, applied
 * in order as tie-breakers by the variadic `bf_sort` runtime. Capitalisation
 * mirrors the Go struct-field convention so the runtime's reflect lookup
 * matches without a recapitalise step.
 */
export function emitBfSort(recv: string, c: SortComparator): string {
  const groups = c.keys.map((k) => {
    const keyName = k.key.kind === 'field' ? capitalize(k.key.field) : ''
    return `"${k.key.kind}" "${keyName}" "${k.type}" "${k.direction}"`
  })
  return `bf_sort ${wrapIfMultiToken(recv)} ${groups.join(' ')}`
}

/**
 * Build the `bf_env` base_env argument for a callback body: one `"name" <value>`
 * pair per captured free variable (a body identifier that isn't a callback
 * param), each lowered to its Go template value via `emit`. No captures →
 * the bare `bf_env` (an empty env).
 */
function emitEvalEnvArg(body: ParsedExpr, params: string[], emit: (e: ParsedExpr) => string): string {
  const free = freeVarsInBody(body, new Set(params))
  if (free.length === 0) return 'bf_env'
  const pairs = free.map(
    n => `"${escapeGoString(n)}" ${wrapIfMultiToken(emit({ kind: 'identifier', name: n }))}`,
  )
  return `(bf_env ${pairs.join(' ')})`
}

/**
 * Emit a `.sort(cmp)` via the evaluator (#2018): the comparator body travels as
 * serialized-ParsedExpr JSON, evaluated per comparison against `{paramA, paramB,
 * …captured}`. Returns null when the comparator can't be evaluated (e.g. a
 * `localeCompare` body — `serializeParsedExpr` refuses it), so the caller falls
 * back to the structured `bf_sort`. A `||`-chained multi-key comparator needs no
 * special handling — JS `0 || next` is exactly the tie-break semantics.
 */
export function emitSortEval(
  recv: string,
  body: ParsedExpr,
  params: string[],
  emit: (e: ParsedExpr) => string,
): string | null {
  const json = serializeParsedExpr(body)
  if (json === null) return null
  // A comparator needs both params; a wrong-arity arrow would bind the wrong
  // env (or treat a real param as a free var), so fail over to the structured
  // fallback / BF101 instead of inventing default names.
  if (params.length < 2) return null
  const paramA = params[0]
  const paramB = params[1]
  const env = emitEvalEnvArg(body, [paramA, paramB], emit)
  return `bf_sort_eval ${wrapIfMultiToken(recv)} "${escapeGoString(json)}" "${paramA}" "${paramB}" ${env}`
}

/**
 * Emit a `.reduce(fn, init)` via the evaluator (#2018): the reducer body travels
 * as serialized-ParsedExpr JSON, folded over the receiver from `init`. Returns
 * null when the body can't be evaluated, or when `init` isn't a string/number
 * literal (a non-literal seed has no template-time value). A numeric seed is
 * passed through `bf_number` (handles any decimal incl. negative / float); a
 * string seed as a quoted string.
 */
export function emitReduceEval(
  recv: string,
  body: ParsedExpr,
  params: string[],
  init: ParsedExpr,
  direction: 'left' | 'right',
  emit: (e: ParsedExpr) => string,
): string | null {
  const json = serializeParsedExpr(body)
  if (json === null) return null
  // A reducer needs both the accumulator and the element param; a wrong-arity
  // arrow would bind the wrong env, so refuse cleanly (→ BF101) rather than
  // defaulting the names.
  if (params.length < 2) return null
  const paramAcc = params[0]
  const paramItem = params[1]
  // Only a literal seed has a template-time value; anything else (an identifier
  // / call) can't be folded here, so bail to the structured-less fallback (BF101).
  let initGo: string
  if (init.kind === 'literal' && init.literalType === 'string') {
    initGo = `"${escapeGoString(String(init.value))}"`
  } else if (init.kind === 'literal' && init.literalType === 'number') {
    initGo = `(bf_number "${escapeGoString(init.raw ?? String(init.value))}")`
  } else {
    return null
  }
  const env = emitEvalEnvArg(body, [paramAcc, paramItem], emit)
  return `bf_reduce_eval ${wrapIfMultiToken(recv)} "${escapeGoString(json)}" "${paramAcc}" "${paramItem}" ${initGo} "${direction}" ${env}`
}

/**
 * Emit a higher-order predicate call via the evaluator (#2018, P2): the
 * predicate body (already a `ParsedExpr` on the `higher-order` IR node) travels
 * as serialized-ParsedExpr JSON, evaluated per element against `{param,
 * …captured}`. Generalizes the field-equality / truthiness catalogues of
 * `bf_filter` / `bf_find` / `bf_every` / `bf_some` to any pure predicate body.
 * Returns null when the predicate is outside the evaluator surface (e.g. a
 * method-call predicate — `serializeParsedExpr` refuses it), so the caller
 * falls back to the structured helper / template-block path.
 *
 *   <func> <recv> "<json>" "<param>" [<extraArgs>…] <env>
 *
 * `extraArgs` are inserted between the param name and the env — used for the
 * find / findIndex `forward` bool (`true` = find / findIndex, `false` =
 * findLast / findLastIndex).
 */
export function emitPredicateEval(
  funcName: string,
  recv: string,
  predicate: ParsedExpr,
  param: string,
  emit: (e: ParsedExpr) => string,
  extraArgs: string[] = [],
): string | null {
  const json = serializeParsedExpr(predicate)
  if (json === null) return null
  const env = emitEvalEnvArg(predicate, [param], emit)
  const extra = extraArgs.length > 0 ? ` ${extraArgs.join(' ')}` : ''
  return `${funcName} ${wrapIfMultiToken(recv)} "${escapeGoString(json)}" "${param}"${extra} ${env}`
}

/**
 * Emit a `.flatMap(proj)` via the evaluator (#2018, P3): the projection body
 * (e.g. `i.tags` / `[i.a, i.b]`) is serialized and evaluated per element by
 * `bf_flat_map_eval`, which flattens the results one level. Returns null when
 * the projection is outside the evaluator surface (→ caller pushes BF101).
 */
export function emitFlatMapEval(
  recv: string,
  body: ParsedExpr,
  param: string,
  emit: (e: ParsedExpr) => string,
): string | null {
  const json = serializeParsedExpr(body)
  if (json === null) return null
  const env = emitEvalEnvArg(body, [param], emit)
  return `bf_flat_map_eval ${wrapIfMultiToken(recv)} "${escapeGoString(json)}" "${param}" ${env}`
}

/**
 * Make an equality comparison string-tolerant when exactly one side is a Go
 * string literal: JS `sorted === 'asc'` is loosely false for `sorted = false`,
 * but Go's template `eq` ERRORS on bool-vs-string (`incompatible types for
 * comparison`). Routing the non-literal side through `bf_string` preserves JS
 * comparison semantics for every concrete type while leaving same-kind
 * comparisons untouched.
 */
export function stringTolerantEqOperands(l: string, r: string): [string, string] {
  const isStrLit = (x: string) => /^"(?:[^"\\]|\\.)*"$/.test(x)
  if (isStrLit(l) === isStrLit(r)) return [l, r]
  // Keep `wrapGoArg`'s parens: a compound operand must reach `bf_string` as ONE
  // argument — `(bf_string (or .Placement "top"))`, not `(bf_string or …)`.
  const wrap = (x: string) => (isStrLit(x) ? x : `(bf_string ${wrapGoArg(x)})`)
  return [wrap(l), wrap(r)]
}

// Generic remediation appended to BF101 / BF102 diagnostics whose reason
// doesn't already carry actionable next steps.
export const GO_REMEDIATION_OPTIONS =
  'Options:\n1. Use @client directive for client-side evaluation\n2. Pre-compute the value in Go code'

// Build the `suggestion.message` for an unsupported expression/condition.
// A self-contained reason (it already spells out the fix — e.g. the
// pre-compute / @client hint or the tailored forEach message) is shown
// as-is; a low-level reason gets the generic options appended; with no
// reason at all we fall back to the options alone.
export function buildUnsupportedSuggestion(support: SupportResult): string {
  if (!support.reason) return GO_REMEDIATION_OPTIONS
  if (support.selfContained) return support.reason
  return `${support.reason}\n\n${GO_REMEDIATION_OPTIONS}`
}

/**
 * Translate a JSX param default (e.g. `'default'`, `0`, `false`) into the
 * corresponding Go literal.
 *
 * @returns the Go literal, or `null` when the default is absent or non-trivial
 *   (objects, arrow functions, …) — caller then lets Go's zero value win.
 */
export function goPropDefault(defaultValue: string | undefined): string | null {
  if (!defaultValue) return null
  const trimmed = defaultValue.trim()
  if (trimmed === '') return null
  if (trimmed === 'true' || trimmed === 'false') return trimmed
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    const body = trimmed.slice(1, -1)
    return JSON.stringify(body)
  }
  // Anything richer (objects, arrays, expressions) would mis-execute as Go.
  return null
}

/**
 * Wrap an `in.X` reference in a Go expression that substitutes `fallback` when
 * the input is the zero value for its type; the comparison is picked from the
 * fallback literal's shape.
 *
 * Asymmetry on bool/zero defaults is intentional (Go has no
 * unset-vs-explicit-false distinction at the struct-field level):
 *   - `true` default → `(in.X || true)`, which is ALWAYS `true`; a caller
 *     wanting `false` must set it after `NewXxxProps`, not via the input struct.
 *   - `false` / `0` default → matches the Go zero value, so this is a no-op
 *     (returns `ref` unchanged).
 * Non-zero numeric defaults substitute, matching JSX `(initial = 5) => …`.
 */
export function applyGoFallback(ref: string, fallback: string): string {
  if (fallback === 'true' || fallback === 'false') {
    return fallback === 'true' ? `(${ref} || true)` : ref
  }
  if (/^-?\d+(\.\d+)?$/.test(fallback)) {
    if (fallback === '0') return ref
    return `func() int { if ${ref} == 0 { return ${fallback} }; return ${ref} }()`
  }
  // String fallback (quoted).
  return `func() string { if ${ref} == "" { return ${fallback} }; return ${ref} }()`
}

/** Convert a JavaScript literal value to Go literal syntax. */
export function goLiteral(value: string): string {
  if (value === 'true' || value === 'false') return value
  if (/^-?\d+(\.\d+)?$/.test(value)) return value
  // Single-quoted → Go double quotes; double-quoted kept as-is.
  if (value.startsWith("'") && value.endsWith("'")) {
    return `"${value.slice(1, -1)}"`
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    return value
  }
  return `"${value}"`
}
