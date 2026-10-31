/**
 * Every operation in the `primitives/` corpus, in output order. A new
 * operation file is listed here; the generator writes one `<fn>.json` per
 * entry and the freshness test fails on a stray or missing JSON file.
 */
import { ge } from './ge'
import { get } from './get'
import { gt } from './gt'
import { le } from './le'
import { lt } from './lt'
import { neg } from './neg'
import { plus } from './plus'
import { strict_eq } from './strict_eq'
import { to_number } from './to_number'
import { to_string } from './to_string'
import { truthy } from './truthy'
import type { PrimitiveOp } from './types'

export const primitiveOps: readonly PrimitiveOp[] = [
  truthy,
  to_number,
  to_string,
  get,
  strict_eq,
  lt,
  le,
  gt,
  ge,
  plus,
  neg,
]
