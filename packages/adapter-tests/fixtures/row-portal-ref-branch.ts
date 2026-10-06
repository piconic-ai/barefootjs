/**
 * `row-portal-ref` with the loop inside a conditional branch (the
 * branch-scoped loop path, #3318). Closing the branch removes the portaled
 * buttons with their rows; reopening it renders and portals fresh ones whose
 * clicks still reach the row handler.
 * Source lives in the fixture-only root
 * (`fixtures/components/RowPortalRefBranch.tsx`).
 *
 * Snapshots in `__snapshots__/row-portal-ref-branch.{html,client.js}` are regenerated
 * by `bun run packages/adapter-tests/scripts/snapshot.ts row-portal-ref-branch`.
 */

import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'row-portal-ref-branch',
  componentName: 'RowPortalRefBranch',
  sourceRoot: 'fixture',
  description: 'A ref-callback createPortal on a keyed loop-row element inside a conditional branch keeps working across hydration and branch toggles',
  props: { rows: ['a', 'b'] },
  interactions: [
    { type: 'click', selector: 'button.row[data-key="b"]' },
    { type: 'expectText', selector: '.last', text: 'b' },
    { type: 'click', selector: 'button.toggle' },
    { type: 'expectHidden', selector: 'button.row' },
    { type: 'click', selector: 'button.toggle' },
    { type: 'click', selector: 'button.row[data-key="a"]' },
    { type: 'expectText', selector: '.last', text: 'a' },
  ],
}

export const fixture = defineSharedFixture(spec)
