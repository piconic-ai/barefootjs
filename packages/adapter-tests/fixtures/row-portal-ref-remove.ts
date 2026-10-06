/**
 * Removal pin for a `ref`-callback portal on a keyed `.map()` row element
 * (#3318). Clicking a row's portaled button removes the row; the button must
 * leave the page with it, and the other rows' portaled buttons must still
 * reach their own handlers.
 * Source lives in the fixture-only root
 * (`fixtures/components/RowPortalRefRemove.tsx`).
 *
 * Snapshots in `__snapshots__/row-portal-ref-remove.{html,client.js}` are regenerated
 * by `bun run packages/adapter-tests/scripts/snapshot.ts row-portal-ref-remove`.
 */

import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'row-portal-ref-remove',
  componentName: 'RowPortalRefRemove',
  sourceRoot: 'fixture',
  description: 'Removing a keyed loop row removes the element its ref callback portaled out, and the other rows keep their click handlers',
  props: { rows: ['a', 'b', 'c'] },
  interactions: [
    { type: 'expectText', selector: '.count', text: '3' },
    { type: 'click', selector: 'button.row[data-key="b"]' },
    { type: 'expectText', selector: '.count', text: '2' },
    { type: 'expectHidden', selector: 'button.row[data-key="b"]' },
    { type: 'click', selector: 'button.row[data-key="c"]' },
    { type: 'expectText', selector: '.count', text: '1' },
  ],
}

export const fixture = defineSharedFixture(spec)
