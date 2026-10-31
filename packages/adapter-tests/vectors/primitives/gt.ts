/** `gt` — JS `>` (see relational.ts for the operand pairs). */
import { relationalOp } from './relational'

export const gt = relationalOp('gt', (a: number, b: number) => a > b)
