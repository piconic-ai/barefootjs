import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

/**
 * #2765 regression fixture, driven in a real browser via
 * `fixture-hydrate.playwright.ts`.
 *
 * `expectValue` alone isn't a discriminator: a broken-out row's `.value`
 * can still read back correctly once the per-row binding repairs it as a
 * DOM property, even though the payload's markup already leaked into a
 * sibling. `expectHidden('.broke')` is what actually rules that out.
 *
 * Snapshots regenerate with
 * `bun run packages/adapter-tests/scripts/snapshot.ts textarea-row-breakout`.
 */

const PAYLOAD = 'a</textarea><b class="broke">X</b>'
const row1 = 'li:nth-child(1) .ta'
const row2 = 'li:nth-child(2) .ta'

export const spec: SharedFixtureSpec = {
  id: 'textarea-row-breakout',
  componentName: 'TextareaRowBreakout',
  sourceRoot: 'fixture',
  description:
    'A controlled textarea in a keyed row keeps its full value when the row is rebuilt (#2765)',
  interactions: [
    { type: 'expectValue', selector: row1, value: PAYLOAD },
    // Only this click makes the reconciler CONSTRUCT row 2 — the leg #2765 implicates.
    { type: 'click', selector: 'button.add' },
    { type: 'expectValue', selector: row2, value: PAYLOAD },
    { type: 'expectHidden', selector: '.broke' },
    { type: 'expectValue', selector: row1, value: PAYLOAD },
  ],
}

export const fixture = defineSharedFixture(spec)
