import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

/**
 * #2765 — the loop-row builder interpolates a controlled `<textarea>`'s
 * lowered value RAW, so a value containing `</textarea>` closes the element
 * early on a row the reconciler builds.
 *
 * The issue's Provenance section is explicit that the break-out consequence
 * was INFERRED from the emitted builder string and never observed, and that
 * confirming it is the first step of any fix. That is what the interactions
 * below do, in a real browser via `fixture-hydrate.playwright.ts`.
 *
 * The assertion is a discriminator either way rather than a one-sided
 * check: `<textarea>`'s `.value` is its child text, so an intact row reads
 * back the whole payload while a broken-out one reads back only `a`, with
 * the remainder promoted into sibling DOM. Whichever happens, the step
 * records which.
 *
 * Row 1 arrives from SSR and is adopted at hydration; only row 2 goes
 * through `createRow`. Asserting row 1 first pins that the SSR and
 * hydration legs are correct, so a failure on row 2 isolates the rebuild
 * path the issue names.
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
    // SSR-rendered, hydration-adopted row: correct on every leg today.
    { type: 'expectValue', selector: row1, value: PAYLOAD },
    // Adding an id makes the reconciler CONSTRUCT row 2 — the only leg the
    // issue implicates.
    { type: 'click', selector: 'button.add' },
    { type: 'expectValue', selector: row2, value: PAYLOAD },
    // A correct `.value` alone would not rule the break-out out: the
    // element's content could be parsed wrong and then repaired by the
    // per-row binding that writes `.value` as a DOM property. If the
    // payload ever closed the element early, the `<b class="broke">` it
    // carries would be left behind as a SIBLING, so its absence is what
    // actually settles it.
    { type: 'expectHidden', selector: '.broke' },
    // The adopted row must be undisturbed by the rebuild.
    { type: 'expectValue', selector: row1, value: PAYLOAD },
  ],
}

export const fixture = defineSharedFixture(spec)
