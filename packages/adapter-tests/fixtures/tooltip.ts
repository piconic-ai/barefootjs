/**
 * Tooltip fixture lifted from `site/ui/components/tooltip-demo.tsx`
 * (#1467 Phase 2c — overlay).
 *
 * `TooltipBasicDemo` is the first fixture to use the `hover` interaction
 * step: the tooltip opens on `mouseenter` of its container span and
 * closes on `mouseleave` — real pointer movement that happy-dom (and the
 * CSR harness) cannot produce. Unlike `dialog` / `popover` (whose state
 * flips inside `ref`-mount effects), the tooltip's `data-state` and
 * class are *template attribute bindings* on the signal
 * (`data-state={open() ? 'open' : 'closed'}`), so the steps probe the
 * compiled `onMouseEnter`/`onMouseLeave` handler wiring through
 * hydration plus the signal → attribute-binding update path.
 *
 * The un-hover steps hover `html` at position (1, 1): Playwright has no
 * unhover, and on this CSS-less host page the *centre* of `html` still
 * lands inside the tooltip's in-flow content block — pixel (1, 1) sits
 * in the body margin where nothing renders, so the pointer reliably
 * leaves the container and fires its `mouseleave`.
 *
 * No CSS is served, so the opacity/scale class swap isn't observable;
 * `data-state` is the contract (asserted open AND closed, so a binding
 * stuck in either direction fails).
 *
 * Snapshots in `__snapshots__/tooltip.{html,client.js}` are regenerated
 * by `bun run packages/adapter-tests/scripts/snapshot.ts tooltip`.
 */

import { defineDemoFixture, type SharedFixtureSpec } from './_helpers'

const container = '[data-slot="tooltip"]'
const content = '[data-slot="tooltip-content"]'

export const spec: SharedFixtureSpec = {
  id: 'tooltip',
  componentName: 'TooltipBasicDemo',
  sourceFile: 'tooltip-demo',
  description:
    'site/ui Tooltip demo — hover opens / unhover closes via signal-driven attribute bindings',
  interactions: [
    // Closed after hydration.
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'closed' },
    { type: 'expectContains', selector: content, text: 'This is a tooltip' },
    // Real pointer onto the trigger — mouseenter sets the signal.
    { type: 'hover', selector: container },
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'open' },
    // Pointer away (centre of <html>) — mouseleave clears it.
    { type: 'hover', selector: 'html', position: { x: 1, y: 1 } },
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'closed' },
    // Second cycle: handlers stay wired after a full round trip.
    { type: 'hover', selector: container },
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'open' },
    { type: 'hover', selector: 'html', position: { x: 1, y: 1 } },
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'closed' },
  ],
}

export const fixture = defineDemoFixture(spec)
