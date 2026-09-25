import { createFixture } from '../src/types'

/**
 * `escapes` twin of `ref-mount-attr` (BF063, `client-directive`): the same
 * `ref` mount callback, with a leading `/* @client *\/` on the ref
 * expression. The author accepts the attribute appearing only after
 * hydration, so it compiles clean and the server HTML carries no
 * `data-mounted` — that absence is the escape's documented
 * `'client-render'` cost, pinned here in `expectedHtml`, not a bug.
 * The full-SSR way out is the `rewrite` twin, `ref-mount-attr-rendered`.
 */
export const fixture = createFixture({
  id: 'ref-mount-attr-client',
  description: 'A /* @client */ ref callback writing an unrendered attribute (the BF063 client-directive escape) compiles clean',
  source: `
'use client'
export function RefMountAttrClient() {
  const handleMount = (el: Element) => {
    el.setAttribute('data-mounted', '1')
  }
  return (
    <div data-slot="target" ref={/* @client */ handleMount}>
      content
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s0" data-slot="target"> content </div>
  `,
})
