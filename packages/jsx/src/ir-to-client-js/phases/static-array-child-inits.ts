/**
 * `static-array-child-inits` phase — emit `initChild(...)` calls for
 * child components living inside a static-array loop.
 *
 * Drives the per-loop emission via a `StaticArrayChildInitsPlan` (built
 * up-front in A1 — three Plan kinds: `single-comp` / `outer-nested` /
 * `inner-loop-nested`). The phase itself is a thin glue: build then
 * stringify.
 *
 * Must run AFTER `provider-and-child-inits` so context providers are
 * available when array children call `useContext()`.
 */

import { buildStaticArrayChildInitsPlan } from '../plan/build-static-array-child-init'
import { stringifyStaticArrayChildInits } from '../stringify/static-array-child-init'
import type { ClientJsContext } from '../types'

export function emitStaticArrayChildInits(lines: string[], ctx: ClientJsContext): void {
  const plans = buildStaticArrayChildInitsPlan(ctx)
  stringifyStaticArrayChildInits(lines, plans)
}
