/**
 * Portal fixture lifted from
 * `integrations/shared/components/PortalExample.tsx`.
 *
 * Exercises `createPortal` + the always-render-with-`hidden`-toggle
 * pattern Dialog primitives use. On hydrate, two `ref={moveToBody}`
 * callbacks fire and `createPortal` relocates the overlay + content
 * divs to `document.body`; visibility is then driven by the reactive
 * `hidden={!open()}` boolean attribute, not by conditional rendering.
 *
 * Surface this adds beyond prior fixtures:
 *   - Ref callbacks running on hydrate (DOM relocation side effects).
 *   - Portal-moved content reached via `data-testid` after parent
 *     reparenting (the runtime must keep the bf-h/bf-s chain wired
 *     through the new parent).
 *   - Reactive boolean `hidden` attribute — absence-on-true semantics
 *     handled via `expectVisible` / `expectHidden`.
 *
 * Snapshots in `__snapshots__/portal.{html,client.js}` are regenerated
 * by `bun run packages/adapter-tests/scripts/snapshot.ts portal`.
 */

import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'portal',
  componentName: 'PortalExample',
  sourceFile: 'PortalExample',
  description:
    'Portal overlay + content moved to document.body via ref callback, visibility via reactive hidden attribute',
  props: {},
  interactions: [
    // Initial: open = false → both portal targets hidden.
    { type: 'expectHidden', selector: '[data-testid="portal-overlay"]' },
    { type: 'expectHidden', selector: '[data-testid="portal-content"]' },

    // Click open → hidden attribute drops on both; portal becomes visible.
    { type: 'click', selector: '[data-testid="open-portal"]' },
    { type: 'expectVisible', selector: '[data-testid="portal-overlay"]' },
    { type: 'expectVisible', selector: '[data-testid="portal-content"]' },

    // Click close button inside the portal → hidden attribute returns; back to closed.
    // The overlay also has an onClick that closes, but Playwright's hit-test
    // resolves to the content (which sits on top of the overlay) — that's a
    // UX layering detail outside the scope of fixture-hydrate's runtime checks.
    { type: 'click', selector: '[data-testid="close-portal"]' },
    { type: 'expectHidden', selector: '[data-testid="portal-overlay"]' },
    { type: 'expectHidden', selector: '[data-testid="portal-content"]' },
  ],
}

export const fixture = defineSharedFixture(spec)
