/**
 * Dialog fixture lifted from `site/ui/components/dialog-demo.tsx`
 * (#1467 Phase 2c — overlay).
 *
 * `DialogBasicDemo` composes the full modal surface: context-provided
 * open state, a portal-mounted overlay + content pair, ESC-to-close on a
 * `document`-level keydown listener, and dedicated close buttons. The
 * runtime paths probed here are exactly the ones happy-dom misrepresents
 * and the CSR harness can't reach:
 *
 *   - `createPortal` — overlay and content are SSR'd inside the demo's
 *     scope but re-parented to `document.body` during hydration; every
 *     open/close assertion uses a `body > …` child selector, so passing
 *     at all proves the portal actually moved the nodes;
 *   - context across portal boundaries — DialogClose / the content's
 *     effect consume `DialogContext` *after* being re-parented out of
 *     the provider's DOM subtree;
 *   - `press: Escape` on `body` — the content's effect installs the
 *     keydown listener on `document` only while open; a trusted key
 *     event in a real browser closes and then *removes* the listener
 *     (the second open/close cycle would misbehave if cleanup leaked).
 *
 * The host page serves no CSS (the fixed/z-index/opacity classes don't
 * apply), so visibility can't be asserted — the effect-driven
 * `data-state` on overlay and content is the observable contract.
 *
 * Snapshots in `__snapshots__/dialog.{html,client.js}` are regenerated
 * by `bun run packages/adapter-tests/scripts/snapshot.ts dialog`.
 */

import { defineDemoFixture, type SharedFixtureSpec } from './_helpers'

const trigger = '[data-slot="dialog-trigger"]'
// `body >` pins the post-portal location: these elements are SSR'd inside
// the demo subtree and only live directly under <body> if createPortal ran.
const content = 'body > [data-slot="dialog-content"]'
const overlay = 'body > [data-slot="dialog-overlay"]'
const close = '[data-slot="dialog-close"]'

export const spec: SharedFixtureSpec = {
  id: 'dialog',
  componentName: 'DialogBasicDemo',
  sourceFile: 'dialog-demo',
  description:
    'site/ui Dialog demo — portal-mounted modal: open via trigger, close via ESC and DialogClose, context across the portal boundary',
  interactions: [
    // Closed after hydration — and already portaled to body.
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'closed' },
    { type: 'expectAttribute', selector: overlay, attribute: 'data-state', value: 'closed' },
    // Open via trigger: both portal halves flip via the context effect.
    { type: 'click', selector: trigger },
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'open' },
    { type: 'expectAttribute', selector: overlay, attribute: 'data-state', value: 'open' },
    // ESC closes — document-level keydown listener installed by the
    // open-state effect (trusted key event, real-browser semantics).
    { type: 'press', selector: 'body', key: 'Escape' },
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'closed' },
    { type: 'expectAttribute', selector: overlay, attribute: 'data-state', value: 'closed' },
    // Second cycle closes via the DialogClose button instead — distinct
    // handler, and proves the ESC listener cleanup didn't wedge state.
    { type: 'click', selector: trigger },
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'open' },
    { type: 'click', selector: close },
    { type: 'expectAttribute', selector: content, attribute: 'data-state', value: 'closed' },
    { type: 'expectAttribute', selector: overlay, attribute: 'data-state', value: 'closed' },
  ],
}

export const fixture = defineDemoFixture(spec)
