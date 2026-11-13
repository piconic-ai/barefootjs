import { createFixture } from '../src/types'

/**
 * A parameter destructure default reads the module scope: a body const of
 * the same name (`const DEF = 'local'`) is not in scope in the parameter
 * list, so `{ b = DEF.toUpperCase() }` takes the module `DEF` (#3725).
 *
 * The client script resolves the name without its scope (limitation
 * `client-binding-named-like-module-binding`): the template inlines the body
 * const into the default, and the mount reads a `DEF` it does not declare.
 * The CSR render and the client-JS scope gate are pinned to it. A body
 * const the component also reads would be declared beside the module one
 * and fail to load, so this one is unread.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-body-const-same-name',
  description: 'A parameter default reads the module const, not a body const of the same name',
  source: `
const DEF = 'm'

export function DestructureDefaultParamBodyConstSameName({ b = DEF.toUpperCase(), c = DEF }: { b?: string; c?: string }) {
  const DEF = 'local'
  return <p title={c}>{b}|{c}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s2" title="m"><!--bf:s0-->M<!--/-->|<!--bf:s1-->m<!--/--></p>
  `,
  dataPoints: [
    { name: 'all-passed', props: { b: 'B', c: 'C' } },
  ],
})
