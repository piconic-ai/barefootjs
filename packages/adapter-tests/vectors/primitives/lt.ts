/** `lt` — JS `<` (see relational.ts for the operand pairs). */
import { relationalOp } from './relational'

export const lt = relationalOp('lt', (a: number, b: number) => a < b)
