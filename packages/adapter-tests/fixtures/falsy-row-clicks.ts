/**
 * Delegated row clicks on falsy row items (#3433): keyed loops over
 * numbers (`0`), strings (`''`) and booleans (`false`), a module-level
 * static array (`0`), and a nested keyed loop whose outer key and inner
 * item are both `0`. Each click must reach its own row's handler.
 * Source lives in the fixture-only root
 * (`fixtures/components/FalsyRowClicks.tsx`).
 *
 * Snapshots in `__snapshots__/falsy-row-clicks.{html,client.js}` are regenerated
 * by `bun run packages/adapter-tests/scripts/snapshot.ts falsy-row-clicks`.
 */

import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'falsy-row-clicks',
  componentName: 'FalsyRowClicks',
  sourceRoot: 'fixture',
  description: 'A delegated click on a loop row whose item is falsy (0, empty string, false) reaches that row\'s handler',
  props: { nums: [0, 1], words: ['', 'b'], flags: [false, true], groups: [[0, 1]] },
  interactions: [
    { type: 'expectText', selector: '.last', text: 'none' },
    { type: 'click', selector: '.nums li[data-key="0"] button' },
    { type: 'expectText', selector: '.last', text: 'num:0' },
    { type: 'click', selector: '.words li[data-key=""] button' },
    { type: 'expectText', selector: '.last', text: 'word:[]' },
    { type: 'click', selector: '.levels li[data-key="0"] button' },
    { type: 'expectText', selector: '.last', text: 'level:0' },
    { type: 'click', selector: '.flags li[data-key="false"] button' },
    { type: 'expectText', selector: '.last', text: 'flag:false' },
    { type: 'click', selector: '.groups button.cell[data-key-1="0"]' },
    { type: 'expectText', selector: '.last', text: 'cell:0:0' },
    { type: 'click', selector: '.nums li[data-key="1"] button' },
    { type: 'expectText', selector: '.last', text: 'num:1' },
  ],
}

export const fixture = defineSharedFixture(spec)
