import { createFixture } from '../src/types'

/**
 * A module const whose initializer reads a global (`Math`) that a prop of
 * the component is named like (#3739). The initializer is module scope, so
 * it calls the global whatever the caller passes as the prop; the component
 * reads its prop.
 */
export const fixture = createFixture({
  id: 'module-const-reads-global-named-like-prop',
  description: 'A module const reading a global keeps reading it when a prop of the component has the same name',
  source: `
'use client'
const big = Math.max(1, 2)

export function ModuleConstReadsGlobalNamedLikeProp({ Math }: { Math: string }) {
  return <p title={Math}>{big}</p>
}
`,
  props: { Math: 'm' },
  expectedHtml: `
    <p bf-s="test" bf="s1" title="m"><!--bf:s0-->2<!--/--></p>
  `,
})
