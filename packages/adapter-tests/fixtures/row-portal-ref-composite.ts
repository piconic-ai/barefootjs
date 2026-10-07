/**
 * `row-portal-ref` with a child component in each row, so the loop
 * compiles to the composite (element-reconciliation) path, whose rows bind
 * the click directly on the portaled element (#3318).
 * Source lives in the fixture-only root
 * (`fixtures/components/RowPortalRefComposite.tsx`).
 *
 * Snapshots in `__snapshots__/row-portal-ref-composite.{html,client.js}` are regenerated
 * by `bun run packages/adapter-tests/scripts/snapshot.ts row-portal-ref-composite`.
 */

import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'row-portal-ref-composite',
  componentName: 'RowPortalRefComposite',
  sourceRoot: 'fixture',
  description: 'A ref-callback createPortal on a keyed loop-row element next to a child component keeps the row click handler working after hydration',
  props: { rows: ['a', 'b'] },
  interactions: [
    { type: 'click', selector: 'button.row[data-key="b"]' },
    { type: 'expectText', selector: '.last', text: 'b' },
  ],
}

export const fixture = defineSharedFixture(spec)
