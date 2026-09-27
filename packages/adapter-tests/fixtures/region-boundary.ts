import { createFixture } from '../src/types'

// `<Region>` (spec/router.md) lowers to a wrapper `<div>` carrying a
// deterministic `bf-region="<file scope>:<index>"` marker — the page-lifecycle
// boundary the client router disposes/re-hydrates. The id is a static string
// (the compiler's FNV `computeFileScope` hash of the source path + a per-file
// index), so it is byte-identical across every adapter: `e6a68a47` is
// `computeFileScope('component.tsx')`, the path the conformance runner compiles
// fixtures under, and `:0` is the first region in the file. This fixture is the
// cross-adapter twin of the Hono-only `ir-region.test.ts` emit assertion in
// packages/jsx — every adapter must emit the same marker for the router to
// match the same region across page documents.
export const fixture = createFixture({
  id: 'region-boundary',
  description: '<Region> lowers to a bf-region page-lifecycle boundary',
  source: `
import { Region } from '@barefootjs/client'
export function Layout() {
  return (
    <div>
      <Region>
        <span>Page</span>
      </Region>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test"><div bf-region="e6a68a47:0"><span>Page</span></div></div>
  `,
})
