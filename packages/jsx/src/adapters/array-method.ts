/**
 * The array / string method catalogue shared by the DSL adapters (#3476).
 *
 * Each DSL adapter lowers `xs.join(sep)`, `s.padStart(n, c)` and the rest of
 * {@link ArrayMethod} to one call of its template runtime's helper. What the
 * call means is the same in all of them: which helper, which arguments, and
 * what fills an argument the source left out (`join` → `','`, `at` → `0`,
 * `slice` end → "to length"). This module owns that meaning as data. An
 * adapter only spells the call: its helper prefix (`bf.`, `$bf->`, `bf->`,
 * `$bf.`), its undefined literal (`none`, `nil`, `null`, `undef`), and the
 * odd helper it lowers to a native operator instead (ERB's `.downcase`).
 *
 * The `Record<ArrayMethod, …>` type is the exhaustiveness guard: a new
 * `ArrayMethod` member fails to compile here, once, instead of in each
 * adapter's `switch`.
 */

import type { ParsedExpr } from '../expression-parser.ts'
import type { ArrayMethod } from './parsed-expr-emitter.ts'

/**
 * Runtime helper ids. Every DSL runtime names the helper by this id; only the
 * receiver syntax around it differs.
 */
export type ArrayMethodHelper =
  | 'join'
  | 'includes'
  | 'index_of'
  | 'last_index_of'
  | 'at'
  | 'concat'
  | 'slice'
  | 'reverse'
  | 'lc'
  | 'uc'
  | 'trim'
  | 'trim_start'
  | 'trim_end'
  | 'to_fixed'
  | 'split'
  | 'starts_with'
  | 'ends_with'
  | 'replace'
  | 'replace_all'
  | 'repeat'
  | 'pad_start'
  | 'pad_end'

/** A literal that fills an argument the source call left out. */
export type ArrayMethodDefault =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  /** The backend's undefined literal; the runtime reads it as "not given". */
  | { kind: 'undefined' }

/** How one argument after the receiver is passed. */
export type ArrayMethodParam =
  /** Always present. The parser refuses the call without it. */
  | { kind: 'required' }
  /** Filled with `value` when the source left it out. */
  | { kind: 'default'; value: ArrayMethodDefault }
  /** Dropped when the source left it out; the helper call is shorter. */
  | { kind: 'optional' }

export interface ArrayMethodEntry {
  helper: ArrayMethodHelper
  /** The arguments after the receiver, in order. Extra source arguments are dropped. */
  params: readonly ArrayMethodParam[]
  /** `xs.concat()` is the receiver itself, not a helper call. */
  receiverWhenNoArgs?: true
}

const required: ArrayMethodParam = { kind: 'required' }
const optional: ArrayMethodParam = { kind: 'optional' }
const zero: ArrayMethodParam = { kind: 'default', value: { kind: 'number', value: 0 } }

export const ARRAY_METHOD_CATALOGUE: Readonly<Record<ArrayMethod, ArrayMethodEntry>> = {
  // `bf.join` rather than a template builtin, so the JS element handling
  // (undefined → empty, default separator) is the runtime's, everywhere.
  join: { helper: 'join', params: [{ kind: 'default', value: { kind: 'string', value: ',' } }] },
  includes: { helper: 'includes', params: [required] },
  // JS's `fromIndex` second argument is not lowered.
  indexOf: { helper: 'index_of', params: [required] },
  lastIndexOf: { helper: 'last_index_of', params: [required] },
  at: { helper: 'at', params: [zero] },
  concat: { helper: 'concat', params: [required], receiverWhenNoArgs: true },
  // The undefined end reads as "to length" in every runtime's `slice`.
  slice: { helper: 'slice', params: [zero, { kind: 'default', value: { kind: 'undefined' } }] },
  reverse: { helper: 'reverse', params: [] },
  toReversed: { helper: 'reverse', params: [] },
  // The runtime coerces a non-string receiver the JS way first; a bare
  // template `lower` filter would not.
  toLowerCase: { helper: 'lc', params: [] },
  toUpperCase: { helper: 'uc', params: [] },
  trim: { helper: 'trim', params: [] },
  // The one-sided siblings of `.trim()` (#2183) have their own helpers.
  trimStart: { helper: 'trim_start', params: [] },
  trimEnd: { helper: 'trim_end', params: [] },
  // `bf.to_fixed` mirrors JS rounding and zero-padding (#1897).
  toFixed: { helper: 'to_fixed', params: [zero] },
  split: { helper: 'split', params: [optional, optional] },
  startsWith: { helper: 'starts_with', params: [required, optional] },
  endsWith: { helper: 'ends_with', params: [required, optional] },
  // String patterns only; the parser refuses a regex pattern (#2182).
  replace: { helper: 'replace', params: [required, required] },
  replaceAll: { helper: 'replace_all', params: [required, required] },
  repeat: { helper: 'repeat', params: [zero] },
  padStart: { helper: 'pad_start', params: [zero, optional] },
  padEnd: { helper: 'pad_end', params: [zero, optional] },
}

/** One argument of a lowered call after the receiver. */
export type ArrayMethodArg =
  | { kind: 'expr'; expr: ParsedExpr }
  | { kind: 'default'; value: ArrayMethodDefault }

/** A lowered array / string method call, as data. */
export type ArrayMethodPlan =
  | { kind: 'receiver'; object: ParsedExpr }
  | { kind: 'call'; helper: ArrayMethodHelper; object: ParsedExpr; args: ArrayMethodArg[] }

/** Lower `object.method(...args)` through {@link ARRAY_METHOD_CATALOGUE}. */
export function lowerArrayMethod(
  method: ArrayMethod,
  object: ParsedExpr,
  args: readonly ParsedExpr[],
): ArrayMethodPlan {
  const entry = ARRAY_METHOD_CATALOGUE[method]
  if (entry.receiverWhenNoArgs && args.length === 0) return { kind: 'receiver', object }
  const out: ArrayMethodArg[] = []
  for (const [i, param] of entry.params.entries()) {
    const arg = args[i]
    if (arg) {
      out.push({ kind: 'expr', expr: arg })
    } else if (param.kind === 'default') {
      out.push({ kind: 'default', value: param.value })
    } else if (param.kind === 'optional') {
      break
    } else {
      throw new Error(`lowerArrayMethod: '.${method}()' needs argument ${i + 1}`)
    }
  }
  return { kind: 'call', helper: entry.helper, object, args: out }
}

/** How one DSL backend spells a lowered call. */
export interface ArrayMethodSpelling {
  /** Spell `helper(receiver, ...args)` from already-emitted operands. */
  call(helper: ArrayMethodHelper, operands: readonly string[]): string
  /** The backend's undefined literal (`none`, `nil`, `null`, `undef`). */
  undefinedLiteral: string
}

/**
 * Emit a plan with `emit` for the operands and `spelling` for the call. The
 * receiver is emitted first, then the arguments in order.
 */
export function emitArrayMethod(
  plan: ArrayMethodPlan,
  emit: (e: ParsedExpr) => string,
  spelling: ArrayMethodSpelling,
): string {
  if (plan.kind === 'receiver') return emit(plan.object)
  const operands = [emit(plan.object)]
  for (const arg of plan.args) {
    operands.push(arg.kind === 'expr' ? emit(arg.expr) : defaultLiteral(arg.value, spelling))
  }
  return spelling.call(plan.helper, operands)
}

/**
 * The text of a default. A string default is written single-quoted, which
 * every DSL backend reads the same way as long as the value has no quote or
 * backslash; the catalogue's only string default is `','`.
 */
function defaultLiteral(value: ArrayMethodDefault, spelling: ArrayMethodSpelling): string {
  switch (value.kind) {
    case 'number':
      return String(value.value)
    case 'string':
      return `'${value.value}'`
    case 'undefined':
      return spelling.undefinedLiteral
  }
}

/** The usual spelling: `<prefix><helper>(operands)`, e.g. `bf.` or `$bf->`. */
export function prefixedArrayMethodSpelling(prefix: string, undefinedLiteral: string): ArrayMethodSpelling {
  return {
    call: (helper, operands) => `${prefix}${helper}(${operands.join(', ')})`,
    undefinedLiteral,
  }
}
