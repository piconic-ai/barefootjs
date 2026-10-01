import type { ParsedExpr } from './expression-parser.ts'

/** Recover an index operand from a computed member's property key.
 * Only canonical array indices become numbers: keys such as "01" must
 * remain strings. Both `obj[0]` and `obj['0']` use the same JS key. */
export function literalMemberIndex(property: string): ParsedExpr {
  const index = Number(property)
  if (Number.isInteger(index) && index >= 0 && index < 0xffffffff && String(index) === property) {
    return { kind: 'literal', value: index, literalType: 'number' }
  }
  return { kind: 'literal', value: property, literalType: 'string' }
}
