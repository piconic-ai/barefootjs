/**
 * Fixtures whose Hono server render diverges from the fixture's contract
 * (`expectedHtml`). Hono is the reference, so an entry here means the
 * contract was authored by hand (see `SKIP_AUTO_UPDATE` in
 * `packages/adapter-tests/scripts/generate-expected-html.ts`) because the
 * reference render itself is the broken side. Each entry cites a limitation.
 */
import type { RenderDivergences } from '@barefootjs/jsx'

export const renderDivergences: RenderDivergences = {
  // A body statement mutating a destructure binding (`local.push('z')`),
  // read through a memo: the server render runs no body statement, so it
  // renders the value before the push.
  'destructure-default-body-mutated-memo': { limitation: 'init-statement-mutation-unrun-on-server' },
}
