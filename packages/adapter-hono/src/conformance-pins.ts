/**
 * Per-fixture build-time contracts for shapes the Hono adapter
 * intentionally refuses to lower. Hono's SSR runtime is JS — its
 * `acceptsTemplateCall` is broad enough to cover every conformance case,
 * so this adapter currently has no pins. Kept as a module (rather than
 * omitted) for uniformity with the other 7 adapter packages: consumed by
 * this package's own conformance test (as `expectedDiagnostics`) and by
 * `bf compat` (issue-URL attribution).
 */

import type { ConformancePins } from '@barefootjs/jsx'

export const conformancePins: ConformancePins = {}
