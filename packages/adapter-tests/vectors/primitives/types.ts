/**
 * Shared shapes for the `primitives/` vector corpus
 * (spec/js-primitive-semantics.md, "Conformance" items 1–4).
 *
 * One file per JS primitive operation (`truthy.ts`, `lt.ts`, …) exports a
 * {@link PrimitiveOp}: the literal JS expression the operation lowers
 * (the reference, never a reimplementation) plus its cases. The generator
 * (`generate.ts`) runs every case through the reference and writes
 * `<op>.json`, which every runtime harness binds to its helper.
 */

/**
 * The proof a case belongs to: what Phase-1 typing would have to establish
 * about the operand(s) for the case to be in scope of a native operator.
 * A target's `NativeSafeTable` (step 0b) claims domains; the harnesses run
 * the native binding only over the claimed ones (step 1 onwards).
 */
export type Domain =
  // One operand: its JS type.
  | 'boolean'
  | 'number'
  | 'string'
  | 'nil'
  | 'object'
  // `neg`: the note's only native-safe unary-minus operand.
  | 'non-zero-number'
  // `number` over a literal's spelling: a safe integer, the native-safe literal.
  | 'safe-integer'
  /**
   * `plus` over two numbers whose sum passes 2^53: no `NativeSafeTable`
   * claims it, so only the helper binding runs it (spec/js-primitive-semantics.md,
   * "Decisions" (5)). Ruby, Python and PHP add integers exactly there.
   */
  | 'beyond-safe-integer'
  // Two operands (`strict_eq`, relational, `plus`).
  | 'number-pair'
  | 'string-pair'
  | 'boolean-pair'
  /** One operand a string, the other a non-nil, non-object primitive. */
  | 'string-mixed'
  /** Two non-nil primitives of different types, neither a string. */
  | 'mixed'
  // `get(recv, key)`.
  /** Array receiver, key a non-negative integer number. */
  | 'array-index'
  /** Array receiver, any other key. */
  | 'array-key'
  | 'string-receiver'
  | 'object-key'

export const DOMAINS: ReadonlySet<Domain> = new Set<Domain>([
  'boolean',
  'number',
  'string',
  'nil',
  'object',
  'non-zero-number',
  'safe-integer',
  'beyond-safe-integer',
  'number-pair',
  'string-pair',
  'boolean-pair',
  'string-mixed',
  'mixed',
  'array-index',
  'array-key',
  'string-receiver',
  'object-key',
])

export interface PrimitiveCase {
  /** Canonical helper id (spec/js-primitive-semantics.md, "Summary"). */
  fn: string
  args: unknown[]
  domain: Domain
  /** What the case pins; `fn + "/" + note` is the stable case key. */
  note: string
}

export interface PrimitiveOp {
  /** Canonical helper id; also the output basename (`<fn>.json`). */
  fn: string
  /**
   * The rollout step (spec/js-primitive-semantics.md, "Rollout plan") that
   * owns this operation. An expected-failure ledger entry for this op must
   * name it.
   */
  step: number
  /** The literal JS expression the operation lowers. */
  reference: (...args: never[]) => unknown
  cases: PrimitiveCase[]
}

/** The JS type a single operand has, as the domains spell it. */
export function unaryDomain(v: unknown): Domain {
  if (v === null || v === undefined) return 'nil'
  if (typeof v === 'boolean') return 'boolean'
  if (typeof v === 'number') return 'number'
  if (typeof v === 'string') return 'string'
  return 'object'
}

/** The domain of a two-operand case. */
export function pairDomain(a: unknown, b: unknown): Domain {
  const ta = unaryDomain(a)
  const tb = unaryDomain(b)
  if (ta === 'object' || tb === 'object') return 'object'
  if (ta === 'nil' || tb === 'nil') return 'nil'
  if (ta === tb) return `${ta}-pair` as Domain
  if (ta === 'string' || tb === 'string') return 'string-mixed'
  return 'mixed'
}
