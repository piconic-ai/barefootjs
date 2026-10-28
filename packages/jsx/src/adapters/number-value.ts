/**
 * Which values are JS numbers, for backends whose own number
 * stringification differs from JS's `Number::toString` (Perl prints
 * `%.15g` and spells the infinities `Inf`), and whose equality operators
 * need the operand's type.
 */

import type { ParsedExpr } from '../expression-parser.ts'
import type { SsrSeedPlan } from '../ssr-seed-plan.ts'
import type { ComponentIR, TypeInfo } from '../types.ts'
import { isNumericArithmeticResult } from './parsed-expr-emitter.ts'

/**
 * Number-typed signals, memos, props and same-file local consts: a strict
 * equality against one of them keeps Perl's numeric `==` / `!=`, where an
 * operand of unknown type goes through the runtime's `strict_eq`
 * (`emitPerlEquality`). `names` holds the bare spellings (a getter, a
 * destructured prop, a const), `props` the caller-facing keys a
 * `props.<key>` member reads. Whether a binding shadows a name is the
 * caller's scope question.
 */
export function collectNumberValueNames(ir: Pick<ComponentIR, 'metadata'>): { names: Set<string>; props: Set<string> } {
  const isNumber = (type: TypeInfo | null | undefined): boolean =>
    type?.kind === 'primitive' && type.primitive === 'number'
  const names = new Set<string>()
  const props = new Set<string>()
  for (const s of ir.metadata.signals) {
    if (isNumber(s.type)) names.add(s.getter)
  }
  for (const m of ir.metadata.memos ?? []) {
    if (isNumber(m.type)) names.add(m.name)
  }
  for (const p of ir.metadata.propsParams) {
    if (!isNumber(p.type)) continue
    props.add(p.sourceName ?? p.name)
    if (!ir.metadata.propsObjectName) names.add(p.name)
  }
  for (const c of ir.metadata.localConstants) {
    if (isNumber(c.type)) names.add(c.name)
  }
  return { names, props }
}

/**
 * Whether an expression yields a JS NUMBER: arithmetic
 * ({@link isNumericArithmeticResult}), a read of a name `isNumberName`
 * accepts — a zero-argument getter call, a `props.<key>` member, or a bare
 * identifier — or a ternary with such a branch. Backends whose own number
 * stringification differs from JS (Perl spells the infinities `Inf` and
 * prints `%.15g`) route such a value through their `Number::toString`
 * helper wherever JS stringifies it: an output position, or an operand of
 * string concatenation (#3711). Whether a binding shadows the name is
 * `isNumberName`'s scope question.
 */
export function isNumberValuedExpr(
  expr: ParsedExpr | null | undefined,
  isStringName: (n: string, componentProperty?: boolean) => boolean,
  isNumberName: (n: string, componentProperty?: boolean) => boolean,
): boolean {
  if (!expr) return false
  if (isNumericArithmeticResult(expr, isStringName)) return true
  // Either branch may be the value printed; the helper passes a string
  // branch through unchanged.
  if (expr.kind === 'conditional') {
    return isNumberValuedExpr(expr.consequent, isStringName, isNumberName) ||
      isNumberValuedExpr(expr.alternate, isStringName, isNumberName)
  }
  if (expr.kind === 'call') return expr.callee.kind === 'identifier' && expr.args.length === 0 && isNumberName(expr.callee.name)
  if (expr.kind === 'member') {
    return !expr.computed && expr.object.kind === 'identifier' && expr.object.name === 'props' && isNumberName(expr.property, true)
  }
  return expr.kind === 'identifier' && isNumberName(expr.name)
}

/**
 * Signals and memos whose in-template seed (a `derived` step of the SSR seed
 * plan) is a JS number by construction: arithmetic, or a read of a
 * number-typed name or of an earlier such seed (an identity memo). Their
 * declared type is often `unknown` (`createMemo(() => count() / 0)` infers
 * none without a checker), so the seed's shape is the evidence (#3711).
 */
export function numberValuedSeedNames(
  plan: SsrSeedPlan,
  isStringName: (n: string, componentProperty?: boolean) => boolean,
  isNumberName: (n: string, componentProperty?: boolean) => boolean,
): Set<string> {
  const names = new Set<string>()
  const isNumber = (n: string, componentProperty?: boolean) =>
    isNumberName(n, componentProperty) || (!componentProperty && names.has(n))
  for (const step of plan.steps) {
    if (step.kind !== 'derived' || step.origin === 'prop') continue
    if (isNumberValuedExpr(step.parsed, isStringName, isNumber)) names.add(step.name)
  }
  return names
}
