/**
 * Carousel fixture lifted from `site/ui/components/carousel-demo.tsx`
 * (#1467 Phase 3 — the last real-browser corpus item).
 *
 * Two things make carousel the corpus's odd one out, both resolved here:
 *
 *  1. **A third-party runtime dependency.** `CarouselContent` mounts Embla
 *     via a bare `import('embla-carousel')`. The host page resolves that
 *     specifier through a gated importmap entry — see `externalImports`
 *     below and the `/__external/` route in
 *     `e2e/fixture-hydrate.playwright.ts`.
 *
 *  2. **Layout-driven state.** Embla reads real element measurements and
 *     runs rAF animations to decide whether it can scroll. With *zero*
 *     CSS every slide collapses onto the same x-position, so embla sees a
 *     single snap and `canScrollNext()` is permanently false — no
 *     interaction is possible. `hostStyles` injects the minimum fixed
 *     layout (a 300px viewport, flex content, full-basis slides) for embla
 *     to measure; nothing else on the page is styled.
 *
 *     Even with that layout, pixel offsets are not asserted. The contract
 *     is the deterministic, layout-independent fallout of a scroll: the
 *     prev/next buttons' `disabled` state, which the component drives off
 *     `embla.canScrollPrev()/canScrollNext()` regardless of how far the
 *     viewport moved. At rest on slide 1 prev is disabled and next is
 *     enabled; any forward scroll (button click or pointer drag) enables
 *     prev, and scrolling back to the start disables it again.
 *
 * Snapshots in `__snapshots__/carousel.{html,client.js}` are regenerated
 * by `bun run packages/adapter-tests/scripts/snapshot.ts carousel`.
 */

import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { defineDemoFixture, type SharedFixtureSpec } from './_helpers'

// Embla ships no `exports` map, so `require.resolve('embla-carousel')`
// lands on the CJS build; the browser needs the ESM sibling. Resolve the
// package, then pivot to `../esm/embla-carousel.esm.js` — the same bundle
// `site/ui/build.ts` copies into the real site dist.
const emblaEsmPath = resolve(
  dirname(createRequire(import.meta.url).resolve('embla-carousel')),
  '../esm/embla-carousel.esm.js',
)

const prev = '[data-slot="carousel-previous"]'
const next = '[data-slot="carousel-next"]'
const viewport = '[data-slot="carousel-viewport"]'

export const spec: SharedFixtureSpec = {
  id: 'carousel',
  componentName: 'CarouselPreviewDemo',
  sourceFile: 'carousel-demo',
  description:
    'site/ui Carousel demo — Embla mounts via a gated importmap; prev/next disabled state tracks canScrollPrev/canScrollNext after button-click and pointer-drag scrolls',
  externalImports: { 'embla-carousel': emblaEsmPath },
  // Minimum layout for embla to measure (see file header). Five
  // full-basis slides in a 300px viewport → embla sees four forward
  // snaps, so `next` is scrollable from the start.
  hostStyles: [
    `${viewport}{width:300px;overflow:hidden}`,
    `[data-slot="carousel-content"]{display:flex}`,
    `[data-slot="carousel-item"]{flex:0 0 100%;min-width:0}`,
  ].join(''),
  interactions: [
    // Embla initialised on the first slide: prev cannot scroll, so its
    // SSR `disabled` attribute survives hydration. (next, being
    // scrollable, gets its `disabled` removed — the click below relies on
    // that, since Playwright's click auto-waits for an enabled target.)
    { type: 'expectAttribute', selector: prev, attribute: 'disabled', value: '' },
    // Scroll forward via the next button. canScrollPrev flips true → the
    // prev button's `disabled` attribute is removed; the click on `prev`
    // both asserts that (auto-wait for enabled) and scrolls back.
    { type: 'click', selector: next },
    { type: 'click', selector: prev },
    // Back at the start, prev is disabled again — the reactive round trip.
    { type: 'expectAttribute', selector: prev, attribute: 'disabled', value: '' },
    // Pointer drag exercises the new `drag` vocabulary against embla's
    // real gesture handler. A leftward drag past the snap midpoint scrolls
    // forward, re-enabling prev — same contract, different input path.
    // The follow-up prev click asserts the enable (auto-wait) and resets.
    { type: 'drag', selector: viewport, deltaX: -200 },
    { type: 'click', selector: prev },
    { type: 'expectAttribute', selector: prev, attribute: 'disabled', value: '' },
  ],
}

export const fixture = defineDemoFixture(spec)
