/**
 * `row-portal-ref` whose portaled row element reads the row item's fields,
 * the loop index and a root-level prop, plus a second loop whose first row
 * is the falsy `0` (#3420). Every adapter renders the elements at the
 * portal outlet with those values, and a row's click still reaches its own
 * handler after hydration. The click goes to the `1` row: the delegated
 * handler looks the row item up by truthiness, so the `0` row's click is
 * dropped on every adapter, portaled or not.
 * Source lives in the fixture-only root
 * (`fixtures/components/RowPortalRefScope.tsx`).
 *
 * Snapshots in `__snapshots__/row-portal-ref-scope.{html,client.js}` are regenerated
 * by `bun run packages/adapter-tests/scripts/snapshot.ts row-portal-ref-scope`.
 */

import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'row-portal-ref-scope',
  componentName: 'RowPortalRefScope',
  sourceRoot: 'fixture',
  description: 'A ref-callback createPortal on a loop-row element that reads the row item, the loop index, a root prop and a falsy row renders them at the portal outlet',
  props: {
    rows: [{ id: 'a', label: 'alpha' }, { id: 'b', label: 'beta' }],
    nums: [0, 1],
    prefix: 'p',
  },
  interactions: [
    { type: 'expectText', selector: '.last', text: 'none' },
    { type: 'click', selector: 'button.row[data-key="b"]' },
    { type: 'expectText', selector: '.last', text: 'beta' },
    { type: 'click', selector: 'button.num[data-key="1"]' },
    { type: 'expectText', selector: '.last', text: '1' },
  ],
}

export const fixture = defineSharedFixture(spec)
