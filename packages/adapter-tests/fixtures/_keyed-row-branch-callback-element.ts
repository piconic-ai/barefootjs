/**
 * KeyedRowBranchCallbackElement fixture. The source is the fixture-only root
 * (`fixtures/components/KeyedRowBranchCallbackElement.tsx`).
 *
 * The counterpart of `keyed-row-branch-call`: a keyed row's conditional
 * branch that holds an element a callback prop built (#3894). That branch
 * is NOT re-evaluated when the row is reused with a new item, so the
 * mounted element keeps its state. The interactions click a pill, replace
 * every item under the same key and expect the pill to still show its
 * count, for a callback called directly, through a bracket access and
 * through a local wrapper, while a scalar branch in a sibling list follows
 * the item.
 *
 * This file is NOT part of the conformance corpus: its name starts with
 * `_`, so the fixture scans skip it, and `index.ts` does not list it. The
 * root passes a function prop (an inline JSX callback), which no adapter's
 * `props` channel carries, and the SSR-vs-hydrated oracle cannot compare
 * the page: hydration builds the callback's elements again under new
 * generated scope ids, on `main` as well. So the page has its own browser
 * spec, `e2e/callback-element-reuse.playwright.ts` (part of
 * `test:fixture-hydrate`), which runs the interactions below after
 * hydration and after a client mount.
 *
 * Snapshots in
 * `__snapshots__/keyed-row-branch-callback-element.{html,client.js}` are
 * regenerated with the corpus's (`BROWSER_ONLY_SPECS` in
 * `src/snapshot-generator.ts`), so the fixture drift check covers them:
 * `bun run packages/adapter-tests/scripts/snapshot.ts keyed-row-branch-callback-element`.
 */

import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'
import type { InteractionStep } from '../src/types'

const LISTS = ['direct', 'bracket', 'wrapper'] as const
const pill = (list: (typeof LISTS)[number], row: number) => `ul.${list} li:nth-child(${row}) button.pill`

/** One step per list: the same step against each way of reaching the callback. */
function eachList(step: (list: (typeof LISTS)[number]) => InteractionStep): InteractionStep[] {
  return LISTS.map(step)
}

export const spec: SharedFixtureSpec = {
  id: 'keyed-row-branch-callback-element',
  componentName: 'KeyedRowBranchCallbackElement',
  sourceRoot: 'fixture',
  description:
    'keyed .map() row: a conditional branch holding an element a callback prop built keeps it, and its state, when the row is reused',
  interactions: [
    ...eachList(list => ({ type: 'expectText', selector: pill(list, 1), text: 'a:0' })),
    { type: 'expectText', selector: 'ul.scalar li:nth-child(1)', text: 'a!' },

    // Give the first pill of each list state of its own.
    ...eachList(list => ({ type: 'click', selector: pill(list, 1) })),
    ...eachList(list => ({ type: 'expectText', selector: pill(list, 1), text: 'a:1' })),

    // Same keys, new items: the scalar branch follows the item, and every
    // pill is the element that was mounted, count included.
    { type: 'click', selector: 'button.relabel' },
    { type: 'expectText', selector: 'ul.scalar li:nth-child(1)', text: 'ax!' },
    { type: 'expectText', selector: 'ul.scalar li:nth-child(2)', text: 'bx!' },
    ...eachList(list => ({ type: 'expectText', selector: pill(list, 1), text: 'a:1' })),
    ...eachList(list => ({ type: 'expectText', selector: pill(list, 2), text: 'b:0' })),

    // The kept pill is still live.
    ...eachList(list => ({ type: 'click', selector: pill(list, 1) })),
    ...eachList(list => ({ type: 'expectText', selector: pill(list, 1), text: 'a:2' })),
  ],
}

export const fixture = defineSharedFixture(spec)
