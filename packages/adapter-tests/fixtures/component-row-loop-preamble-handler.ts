import { createFixture } from '../src/types'

/**
 * #2797 — same defect family as #2750 (a preamble-declared const referenced
 * only via `.map()` row machinery, dropped from the emitted module) but a
 * DISTINCT code path: here the row body is a CHILD-COMPONENT call
 * (`createComponent(...)`/`initChild(...)`), and the dropped identifier is
 * passed as a PROP VALUE (`onClick={handleRowClick}`), not called directly
 * like #2750's `ref`.
 *
 * `handleRowClick` is a loop-ROW preamble local (`MapCallbackPreamble`), not
 * a component-scope const — it reads `row`/`idx`, so it can only be declared
 * inside the `.map()` callback, never hoisted to component scope (that would
 * be a `ReferenceError` on `row`/`idx` outside the loop). Every dynamic loop
 * variant except `'component'` already renders its preamble
 * (`mapPreambleWrapped`); this fixture pins that the `'component'` variant
 * does too, declaring the preamble once before the `initChild`/
 * `createComponent` split so both the hydration-reuse and fresh-row branches
 * read the same value.
 *
 * `items` MUST be signal-backed for the same reason as `nested-loop-ref-
 * const.ts` (#2750): a literal array takes the static fast path, which
 * never even reaches `mapArray`'s row-construction machinery — that path
 * would make this fixture pass regardless of whether the fix is present.
 *
 * `expectedHtml` is unaffected (the bug is client-JS-emission-only — SSR's
 * template function already rendered the preamble correctly; only the
 * client reconciler's `'component'` loop-plan variant dropped it). The
 * regression pin is `client-js-scope.test.ts`'s automatic TS scope check:
 * pre-fix this fixture's emitted client JS fails to typecheck (`Cannot find
 * name 'handleRowClick'`); post-fix it passes with no changes needed to
 * that test file. Verified directly (reverting the fix reproduces the
 * pre-fix failure here).
 */
export const fixture = createFixture({
  id: 'component-row-loop-preamble-handler',
  description: 'a loop-row preamble local passed as a child-component prop has its declaration emitted',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
function Row({ label, onClick }: { label: string; onClick: () => void }) {
  return <div className="row" onClick={onClick}>{label}</div>
}
export function ComponentRowLoop() {
  const [items] = createSignal([
    { id: 1, label: 'Alpha' },
    { id: 2, label: 'Beta' },
  ])
  return (
    <div>
      {items().map((row, idx) => {
        const handleRowClick = () => {}
        return <Row key={row.id} label={row.label} onClick={handleRowClick} />
      })}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1">
      <div bf-s="Row_*" bf="s1" class="row" data-key="1"><!--bf:s0-->Alpha<!--/--></div>
      <div bf-s="Row_*" bf="s1" class="row" data-key="2"><!--bf:s0-->Beta<!--/--></div>
    </div>
  `,
})
