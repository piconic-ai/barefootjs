/**
 * Select fixture lifted from `site/ui/components/select-demo.tsx`
 * (#1467 Phase 2d — selection/menu composites).
 *
 * `SelectBasicDemo` is the full listbox loop: a portal-mounted content
 * panel (same `body > …` proof as `dialog`/`popover`), trigger state
 * driven by a context effect, and — new in this corpus — a *selection
 * round trip*: clicking an item writes the demo's signal through
 * `onValueChange`, closes the panel, flips the item's
 * `data-state`/`aria-selected` via its own effect, AND rewrites the
 * trigger's `SelectValue` text from the selected item's label (a
 * `document.querySelector` lookup inside an effect — DOM-global
 * reactivity the CSR harness can't model). Re-selecting a different
 * item must uncheck the first, mirroring `radio-group`'s
 * single-selection invariant inside an overlay.
 *
 * The disabled item (`blueberry`) is pinned via `aria-disabled` only —
 * its click guard returns before `onValueChange`, but clicking it would
 * race Playwright's actionability checks on a CSS-less page, so the
 * attribute is the asserted contract.
 *
 * Snapshots in `__snapshots__/select.{html,client.js}` are regenerated
 * by `bun run packages/adapter-tests/scripts/snapshot.ts select`.
 */

import { defineDemoFixture, type SharedFixtureSpec } from './_helpers'

const trigger = '[data-slot="select-trigger"]'
const value = '[data-slot="select-value"]'
// `body >` pins the post-portal location (see dialog fixture).
const content = 'body > [data-slot="select-content"]'
const item = (v: string) => `${content} [data-slot="select-item"][data-value="${v}"]`
const readout = '.selected-value'

export const spec: SharedFixtureSpec = {
  id: 'select',
  componentName: 'SelectBasicDemo',
  sourceFile: 'select-demo',
  description:
    'site/ui Select demo — portal listbox selection round trip: item click writes the signal, closes, and rewrites the trigger value',
  interactions: [
    // Closed after hydration; placeholder shown, nothing selected.
    { type: 'expectAttribute', selector: trigger, attribute: 'aria-expanded', value: 'false' },
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'closed' },
    { type: 'expectText', selector: value, text: 'Select a fruit...' },
    { type: 'expectContains', selector: readout, text: 'None' },
    // Open the listbox.
    { type: 'click', selector: trigger },
    { type: 'expectAttribute', selector: trigger, attribute: 'data-state', value: 'open' },
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'open' },
    { type: 'expectAttribute', selector: item('blueberry'), attribute: 'aria-disabled', value: 'true' },
    // Pick Apple — closes, checks the item, rewrites trigger + readout.
    { type: 'click', selector: item('apple') },
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'closed' },
    { type: 'expectAttribute', selector: item('apple'), attribute: 'data-state', value: 'checked' },
    { type: 'expectText', selector: value, text: 'Apple' },
    { type: 'expectContains', selector: readout, text: 'apple' },
    // Reopen and move the selection — single-selection invariant.
    { type: 'click', selector: trigger },
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'open' },
    { type: 'click', selector: item('grape') },
    { type: 'expectAttribute', selector: item('grape'), attribute: 'data-state', value: 'checked' },
    { type: 'expectAttribute', selector: item('apple'), attribute: 'data-state', value: 'unchecked' },
    { type: 'expectText', selector: value, text: 'Grape' },
    { type: 'expectContains', selector: readout, text: 'grape' },
  ],
}

export const fixture = defineDemoFixture(spec)
