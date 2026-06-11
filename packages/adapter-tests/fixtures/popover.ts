/**
 * Popover fixture lifted from `site/ui/components/popover-demo.tsx`
 * (#1467 Phase 2c — overlay).
 *
 * `PopoverBasicDemo` is the anchored-overlay contrast to `dialog`:
 * the content portals to `document.body` *and positions itself against
 * the trigger* via `getBoundingClientRect` — layout geometry that only
 * exists in a real browser (happy-dom rects are all zeros). What the
 * steps probe:
 *
 *   - `findSiblingSlot` — PopoverContent grabs its trigger reference
 *     *before* the portal re-parents it, then keeps using it for
 *     positioning afterwards;
 *   - the trigger's `aria-expanded` is effect-driven off context while
 *     the content's `data-state` is driven by a separate effect on the
 *     portaled node — both must flip together on every transition;
 *   - ESC close path (document-level keydown installed only while
 *     open), then a full reopen + trigger-toggle close to prove the
 *     listener cleanup cycle.
 *
 * No CSS is served, so positioning itself isn't asserted (the inline
 * `style.top/left` writes depend on font metrics) — `data-state` +
 * `aria-expanded` are the observable contract.
 *
 * Snapshots in `__snapshots__/popover.{html,client.js}` are regenerated
 * by `bun run packages/adapter-tests/scripts/snapshot.ts popover`.
 */

import { defineDemoFixture, type SharedFixtureSpec } from './_helpers'

const trigger = '[data-slot="popover-trigger"]'
// `body >` pins the post-portal location (see dialog fixture).
const content = 'body > [data-slot="popover-content"]'

export const spec: SharedFixtureSpec = {
  id: 'popover',
  componentName: 'PopoverBasicDemo',
  sourceFile: 'popover-demo',
  description:
    'site/ui Popover demo — trigger-anchored portal overlay: toggle, ESC close, aria-expanded/data-state in lockstep',
  interactions: [
    // Closed after hydration, already portaled.
    { type: 'expectAttribute', selector: trigger, attribute: 'aria-expanded', value: 'false' },
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'closed' },
    // Open via trigger click — both effects flip.
    { type: 'click', selector: trigger },
    { type: 'expectAttribute', selector: trigger, attribute: 'aria-expanded', value: 'true' },
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'open' },
    { type: 'expectContains', selector: content, text: 'This is a basic popover' },
    // ESC closes (document-level listener, trusted key event).
    { type: 'press', selector: 'body', key: 'Escape' },
    { type: 'expectAttribute', selector: trigger, attribute: 'aria-expanded', value: 'false' },
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'closed' },
    // Reopen, then close by toggling the trigger — exercises the
    // `onOpenChange(!open())` toggle path and listener re-install.
    { type: 'click', selector: trigger },
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'open' },
    { type: 'click', selector: trigger },
    { type: 'expectAttribute', selector: trigger, attribute: 'aria-expanded', value: 'false' },
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'closed' },
  ],
}

export const fixture = defineDemoFixture(spec)
