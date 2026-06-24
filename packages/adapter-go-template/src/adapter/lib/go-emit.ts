/**
 * Go html/template emit helpers for the Go adapter.
 *
 * Pure helpers extracted from `go-template-adapter.ts` (Phase 1 refactor):
 * Go-template string escaping, argument wrapping, `bf_*` runtime-helper
 * call construction, and JSX-literal → Go-literal lowering. None read
 * adapter instance state.
 */

import type { SortComparator, ReduceOp, SupportResult } from '@barefootjs/jsx'

import { capitalize } from "./go-naming.ts"

/** Escape a value for embedding in a Go-template double-quoted string. */
export function escapeGoString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Wrap a rendered Go template fragment in parens when it would
 * otherwise parse as multiple sibling args of an enclosing prefix
 * call. A bare identifier / dotted path / quoted literal stays
 * uncluttered; anything containing whitespace (a function call,
 * `len ...`, etc.) gets `(...)` so `bf_join (...) bf_trim .Raw`
 * doesn't degrade to four args of `bf_join`. Used by emitters that
 * compose runtime helpers (#1443 / #1445 Copilot review).
 */
export function wrapIfMultiToken(rendered: string): string {
  // Already wrapped — don't double-wrap.
  if (rendered.startsWith('(') && rendered.endsWith(')')) return rendered
  // Quoted literals can contain spaces inside the string but parse
  // as a single token; leave them alone.
  if (rendered.startsWith('"') && rendered.endsWith('"')) return rendered
  if (/\s/.test(rendered)) return `(${rendered})`
  return rendered
}

/**
 * Parenthesize a compound Go template argument (`or .Checked false`) so a
 * primitive call reads it as ONE argument — unwrapped, the parser splits
 * it into three and `bf_string` fails with "want 1 got 3" (#1896,
 * DropdownMenuCheckboxItem's `String(props.checked ?? false)`).
 */
export function wrapGoArg(arg: string): string {
  if (!/\s/.test(arg)) return arg
  if (arg.startsWith('(') && arg.endsWith(')')) return arg
  return `(${arg})`
}

/**
 * Emit the `bf_sort` call shared by the standalone `sortMethod()`
 * arm and the chained `.sort().map()` loop hoist. The runtime helper
 * takes 4 string operands so a future `nulls` knob can grow on the
 * end without rewriting either call site (#1448 Tier B):
 *
 *   bf_sort <recv> (<keyKind> <keyName> <compareType> <direction>)+
 *
 *   keyKind:      "self" | "field"
 *   keyName:      "" when keyKind=self; capitalised field name otherwise
 *   compareType:  "numeric" | "string" | "auto"
 *   direction:    "asc" | "desc"
 *
 * The 4-string group repeats once per comparison key: a simple
 * comparator emits one group; a `||`-chained multi-key comparator
 * emits one per operand, applied in order as tie-breakers by the
 * variadic `bf_sort` runtime.
 *
 * The capitalisation mirrors the Go-side struct-field convention
 * (`bf_sort .Items "field" "Price" "numeric" "asc"`) so the runtime
 * helper's reflect lookup matches without a recapitalise step.
 */
export function emitBfSort(recv: string, c: SortComparator): string {
  // One 4-string group per comparison key (keyKind, keyName,
  // compareType, direction). A single-key comparator emits exactly the
  // pre-multi-key shape; `||`-chained keys append further groups, which
  // `bf_sort`'s variadic runtime applies in order as tie-breakers.
  const groups = c.keys.map((k) => {
    const keyName = k.key.kind === 'field' ? capitalize(k.key.field) : ''
    return `"${k.key.kind}" "${keyName}" "${k.type}" "${k.direction}"`
  })
  return `bf_sort ${wrapIfMultiToken(recv)} ${groups.join(' ')}`
}

/**
 * Emit the `bf_reduce` call for a `.reduce(fn, init)` arithmetic fold
 * (#1448 Tier C):
 *
 *   bf_reduce <recv> "<op>" "<keyKind>" "<keyName>" "<type>" "<init>" "<direction>"
 *
 *   op:        "+" | "*"
 *   keyKind:   "self" | "field"
 *   keyName:   "" when keyKind=self; capitalised field name otherwise
 *              (matches the Go struct-field convention, mirroring
 *              `emitBfSort`)
 *   type:      "numeric" | "string"
 *   init:      the fold's start value — the numeric literal's text for a
 *              numeric fold, or the string literal's contents for a
 *              concat fold
 *   direction: "left" (reduce) | "right" (reduceRight)
 *
 * The runtime folds `init <op> key(item)` in `direction` order and
 * returns the accumulated value (float64 for numeric, string for
 * concat). The order is only observable for string concat — numeric
 * sum / product commute.
 */
export function emitBfReduce(recv: string, op: ReduceOp, direction: 'left' | 'right'): string {
  const keyName = op.key.kind === 'field' ? capitalize(op.key.field) : ''
  // `op.init` is already the decoded seed value (canonical decimal for
  // numeric folds — `strconv.ParseFloat`-safe; escape-free contents for
  // concat folds). Pass it as a quoted operand the runtime interprets
  // by `type`. `direction` is "left" (reduce) or "right" (reduceRight)
  // — only observable for string concatenation; numeric folds are
  // commutative.
  return `bf_reduce ${wrapIfMultiToken(recv)} "${op.op}" "${op.key.kind}" "${keyName}" "${op.type}" "${escapeGoString(op.init)}" "${direction}"`
}

/**
 * Make an equality comparison string-tolerant when exactly one side is a
 * Go string literal (#1896): JS `sorted === 'asc'` is loosely false for
 * `sorted = false`, but Go's template `eq` ERRORS on bool-vs-string
 * (`incompatible types for comparison` — DataTableColumnHeader's
 * `'asc' | 'desc' | false` union prop). Routing the non-literal side
 * through `bf_string` preserves JS comparison semantics for every
 * concrete type while keeping same-kind comparisons untouched.
 */
export function stringTolerantEqOperands(l: string, r: string): [string, string] {
  const isStrLit = (x: string) => /^"(?:[^"\\]|\\.)*"$/.test(x)
  if (isStrLit(l) === isStrLit(r)) return [l, r]
  // Keep `wrapGoArg`'s parentheses: a compound operand must reach
  // `bf_string` as ONE argument — `(bf_string (or .Placement "top"))`,
  // not `(bf_string or .Placement "top")` (which the template parser
  // reads as three arguments and fails at runtime).
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
 * Translate a JSX param default (e.g. `'default'`, `0`, `false`) into
 * the corresponding Go literal. Returns null when the default is
 * absent or non-trivial (objects, arrow functions, etc.) — those
 * fall back to letting Go's zero value win.
 */
export function goPropDefault(defaultValue: string | undefined): string | null {
  if (!defaultValue) return null
  const trimmed = defaultValue.trim()
  if (trimmed === '') return null
  if (trimmed === 'true' || trimmed === 'false') return trimmed
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed
  // Single- and double-quoted strings.
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    const body = trimmed.slice(1, -1)
    return JSON.stringify(body)
  }
  // Bail on anything richer (objects, arrays, expressions). The
  // generated Go would mis-execute a JS expression.
  return null
}

/**
 * Wrap an `in.X` reference in a Go expression that substitutes
 * `fallback` when the input is the zero value for its type. We pick
 * the comparison based on the fallback literal's shape.
 *
 * Asymmetry on bool defaults is intentional and worth flagging:
 *   - For a `true` default, the generated expression is
 *     `(in.X || true)` — which is **always `true`**. Go has no
 *     unset-vs-explicit-false distinction at the struct-field level,
 *     so any caller wanting to thread `false` through has to set it
 *     after `NewXxxProps` rather than via the input struct.
 *   - For a `false` default, the Go zero value already matches, so
 *     the helper is a no-op (returns `ref` unchanged).
 * Numeric `0` defaults are similarly indistinguishable from "unset"
 * and pass through as the zero value; non-zero numeric defaults
 * substitute, matching the JSX behavior of `(initial = 5) => ...`.
 */
export function applyGoFallback(ref: string, fallback: string): string {
  if (fallback === 'true' || fallback === 'false') {
    return fallback === 'true' ? `(${ref} || true)` : ref
  }
  if (/^-?\d+(\.\d+)?$/.test(fallback)) {
    if (fallback === '0') return ref
    return `func() int { if ${ref} == 0 { return ${fallback} }; return ${ref} }()`
  }
  // String fallback (quoted)
  return `func() string { if ${ref} == "" { return ${fallback} }; return ${ref} }()`
}

/** Convert a JavaScript literal value to Go literal syntax. */
export function goLiteral(value: string): string {
  // Boolean
  if (value === 'true' || value === 'false') return value
  // Number
  if (/^-?\d+(\.\d+)?$/.test(value)) return value
  // String with single quotes -> Go double quotes
  if (value.startsWith("'") && value.endsWith("'")) {
    return `"${value.slice(1, -1)}"`
  }
  // String with double quotes -> keep as is
  if (value.startsWith('"') && value.endsWith('"')) {
    return value
  }
  // Default: wrap in quotes
  return `"${value}"`
}
