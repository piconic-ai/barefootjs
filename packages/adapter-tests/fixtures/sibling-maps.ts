import { createFixture } from '../src/types'

/**
 * Two `.map()` calls share a parent — each must reconcile its own range (#1087).
 * Pre-fix, `findLoopMarkers()` returned the LAST start/end pair to every
 * consumer and the second loop overwrote the first into the same DOM range.
 *
 * Empty initial arrays keep this fixture focused on the SSR shape contract:
 * each loop emits its own scoped marker pair (`<!--bf-loop:lN--> ... <!--bf-/loop:lN-->`)
 * and both pairs are stripped by `normalizeHTML`, so the expected HTML is
 * just the bare container. Compiler-level tests
 * (`client-only-loop-ssr-markers.test.ts::sibling .map() calls under the
 * same parent get distinct marker ids`) and a runtime regression test
 * (`map-array.test.ts::sibling mapArray calls under the same parent do
 * not collide`) cover the marker-id-disambiguation behavior end-to-end.
 */
export const fixture = createFixture({
  id: 'sibling-maps',
  description: 'Sibling .map() calls under the same parent each get their own scoped marker pair (#1087)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SiblingMaps() {
  const [a] = createSignal<number[]>([])
  const [b] = createSignal<number[]>([])
  return (
    <div>
      {a().map((n) => <span key={\`a-\${n}\`} data-set="a">{String(n)}</span>)}
      {b().map((n) => <span key={\`b-\${n}\`} data-set="b">{String(n)}</span>)}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2"></div>
  `,
})
