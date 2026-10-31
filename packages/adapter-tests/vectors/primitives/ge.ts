/** `ge` — JS `>=` (see relational.ts for the operand pairs). */
import { relationalOp } from './relational'

export const ge = relationalOp('ge', (a: number, b: number) => a >= b)
