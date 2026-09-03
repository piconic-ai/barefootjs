/**
 * Per-fixture build-time contracts for shapes the Hono adapter
 * intentionally refuses to lower. Hono's SSR runtime is JS — its
 * `acceptsTemplateCall` is broad enough to cover every adapter-specific
 * lowering gap, so the only pins here are compiler-level refusals that
 * fire ahead of `adapter.generate()` and apply identically everywhere.
 * `date-method-uncatalogued` stays pinned even here: hydrate-init
 * re-evaluates the expression against a JSON-de-riched receiver, so a
 * Hono-specific carve-out was evaluated and rejected (#2356).
 */

import type { ConformancePins } from '@barefootjs/jsx'

export const conformancePins: ConformancePins = {
  'date-method-uncatalogued': [{ code: 'BF021', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2356' }],
  'rich-prop-client-read': [{ code: 'BF049', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2648' }],
  // #2667: a ternary/array LITERALLY WRAPPING JSX at a non-children prop
  // position (e.g. `header={cond ? <a/> : <b/>}`) is refused ahead of
  // `adapter.generate()` in the shared jsx-to-ir.ts phase, so it is pinned
  // identically on every adapter (including Hono) — same reasoning as
  // `rich-prop-client-read` above.
  'jsx-element-prop-ternary': [{ code: 'BF021', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2667' }],
  'jsx-element-prop-array': [{ code: 'BF021', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2667' }],
  // #2771: a reactive primitive invoked through a namespace import
  // (`import * as bf from '@barefootjs/client'`, `bf.createSignal(...)`)
  // that the analyzer's checker-less fast path cannot recognize refuses
  // loudly (BF013) instead of silently dropping the declaration — fired
  // in the shared analyzer pass ahead of any adapter's `adapter.generate()`,
  // so all nine adapters (including Hono) pin this identically.
  'namespace-import-primitive': [{ code: 'BF013', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2771' }],
}
