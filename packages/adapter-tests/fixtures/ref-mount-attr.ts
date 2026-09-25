import { createFixture } from '../src/types'

/**
 * A minimal, component-agnostic repro of the `ref-effect-attr-state-ssr`
 * registry entry: a `ref` mount callback that writes an attribute the
 * element's JSX never renders. A `ref` callback never runs at SSR, so the
 * server HTML always lacks the attribute and hydration always adds it — a
 * visible snap at the hydrate boundary.
 *
 * Used to be a browser-tested `defineSharedFixture` quarantined in
 * `oracle-quarantine.ts`; the shape is now a loud BF063 compile-time
 * refusal (`recordRefAttrsAbsentAtSsr`, `jsx-to-ir.ts`), so this fixture
 * asserts the refusal (`conformancePins`, every adapter including Hono — a
 * shared jsx-to-ir.ts refusal fires ahead of any adapter's
 * `adapter.generate()`) rather than comparing rendered HTML. The
 * exemptions are pinned by
 * `packages/jsx/src/__tests__/ref-attr-absent-at-ssr.test.ts`.
 *
 * `escapes` twins: `ref-mount-attr-rendered` (`rewrite` — the same
 * callback, with the attribute also rendered in JSX, so SSR already
 * carries it) and `ref-mount-attr-client` (`client-directive` — a leading
 * `/* @client *\/` on the ref, accepting the attribute appearing only
 * after hydration).
 */
export const fixture = createFixture({
  id: 'ref-mount-attr',
  description: 'A ref mount callback writing an attribute the JSX never renders refuses with BF063',
  source: `
'use client'
export function RefMountAttr() {
  const handleMount = (el: Element) => {
    el.setAttribute('data-mounted', '1')
  }
  return (
    <div data-slot="target" ref={handleMount}>
      content
    </div>
  )
}
`,
  escapes: [
    { kind: 'rewrite', fixture: 'ref-mount-attr-rendered' },
    { kind: 'client-directive', fixture: 'ref-mount-attr-client' },
  ],
})
