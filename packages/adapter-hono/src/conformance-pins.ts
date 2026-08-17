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
 *
 * `date-method-uncatalogued`'s pin here is not "Hono copies DSL caution" —
 * a Hono-specific carve-out was evaluated and rejected on independently
 * verified grounds (hydrate-init re-evaluates the expression against a
 * JSON-de-riched receiver; see the fixture's own docstring and the #2356
 * decision comment). This is the one BF021 fixture kept pinned on every
 * adapter including this one, deliberately.
 */

import type { ConformancePins } from '@barefootjs/jsx'

export const conformancePins: ConformancePins = {
  'date-method-uncatalogued': [{ code: 'BF021', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2356' }],
  // #2648: a Map-typed prop used by this component's own client code (a
  // handler, an effect) cannot survive the bf-p JSON boundary intact --
  // BF021 only walks template-lowered expression positions, so a handler
  // body's `data.get(...)` is just as invisible to it as a bare read; this
  // is a distinct compiler-level refusal (checkRichTypePropSerialization),
  // pinned identically on every adapter for the same reason
  // date-method-uncatalogued is: a hydration-transport gap, not a
  // template-lowering gap, so it recurs on Hono's JS-runtime hydrate leg
  // exactly as much as on a DSL adapter's.
  'rich-prop-client-read': [{ code: 'BF049', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2648' }],
}
