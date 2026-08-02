/**
 * SCRATCH verification fixture (#2463 coordinator follow-up) — proves
 * `insertRoot()`'s real branch-SWAP path (not just hydration) correctly
 * tears down and re-initializes a CHILD COMPONENT mounted inside one
 * branch of a signal-conditioned `if`/`else` early return. Neither
 * `signal-early-return` (plain text branches, no child component) nor
 * `button`/`kbd`/`Slot` (composes a child, but via a destructured `asChild`
 * prop that can never actually swap — see the PR discussion) exercises
 * this combination.
 *
 * Not part of the permanent corpus — delete after verification, or keep
 * as a regression pin if the reviewer wants permanent coverage for this
 * shape.
 */
import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'if-statement-child-swap',
  componentName: 'IfStatementChildSwap',
  sourceRoot: 'fixture',
  additionalComponents: ['Badge'],
  description: 'Signal-conditioned if/else swaps a branch containing a child component (insertRoot swap path)',
  interactions: [
    { type: 'expectText', selector: '.badge', text: 'on:0' },
    { type: 'click', selector: '.badge' },
    { type: 'expectText', selector: '.badge', text: 'on:1' },
    { type: 'click', selector: 'button' },
    { type: 'expectText', selector: 'span:not(.badge)', text: 'off' },
    { type: 'click', selector: 'button' },
    { type: 'expectText', selector: '.badge', text: 'on:0' },
    { type: 'click', selector: '.badge' },
    { type: 'expectText', selector: '.badge', text: 'on:1' },
  ],
}

export const fixture = defineSharedFixture(spec)
