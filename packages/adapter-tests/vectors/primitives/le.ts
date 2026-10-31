/** `le` — JS `<=` (see relational.ts for the operand pairs). */
import { relationalOp } from './relational'

export const le = relationalOp('le', (a: number, b: number) => a <= b)
