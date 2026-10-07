/**
 * `row-portal-ref` over a module-level constant array: the loop compiles to
 * the static-array path (no `mapArray`), whose rows pair with their portaled
 * elements and delegate the click by row key (#3318).
 * Source lives in the fixture-only root
 * (`fixtures/components/RowPortalRefStatic.tsx`).
 *
 * Snapshots in `__snapshots__/row-portal-ref-static.{html,client.js}` are regenerated
 * by `bun run packages/adapter-tests/scripts/snapshot.ts row-portal-ref-static`.
 */

import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'row-portal-ref-static',
  componentName: 'RowPortalRefStatic',
  sourceRoot: 'fixture',
  description: 'A ref-callback createPortal on a keyed static-array loop-row element keeps the row click handler working after hydration',
  interactions: [
    { type: 'expectText', selector: '.last', text: 'none' },
    { type: 'click', selector: 'button.row[data-key="b"]' },
    { type: 'expectText', selector: '.last', text: 'b' },
  ],
}

export const fixture = defineSharedFixture(spec)
