/**
 * Regression pin (#2463) for `insertRoot()`'s real branch-SWAP path — not
 * just the hydration path — proving it tears down and re-initializes a
 * CHILD COMPONENT mounted inside one branch of a signal-conditioned
 * `if`/`else` early return.
 *
 * Nothing else in the corpus covers this combination: `signal-early-return`
 * has plain text branches with no child component, and `button`/`kbd`/`Slot`
 * compose a child but branch on a destructured `asChild` prop that can never
 * actually swap after mount. Without this fixture, `copyRootIdentityAttrs`'
 * scope-identity preservation across a swap — the reason a nested child's
 * `.closest('[bf-s]')` still resolves after the root element is replaced —
 * would have no coverage at all.
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
