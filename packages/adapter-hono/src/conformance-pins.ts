/**
 * Per-fixture build-time contracts for shapes the Hono adapter
 * intentionally refuses to lower. Hono's SSR runtime is JS — its
 * `acceptsTemplateCall` is broad enough to cover every adapter-specific
 * lowering gap, so this package's only pin is the one refusal that is
 * NOT adapter-specific: a method call on a host rich-typed prop (Date,
 * Map, …) with no catalogued lowering refuses with BF021 at the
 * compiler layer (`checkRichTypeMethodCalls`), ahead of and independent
 * of `adapter.generate()` — even Hono's native JS evaluation never sees
 * the call (#2273). Consumed by this package's own conformance test (as
 * `expectedDiagnostics`) and by `bf compat` (issue-URL attribution).
 */

import type { ConformancePins } from '@barefootjs/jsx'

export const conformancePins: ConformancePins = {
  'date-method-uncatalogued': [{ code: 'BF021', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2273' }],
}
