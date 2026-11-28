import { createFixture } from '../src/types'

/**
 * A component const initialized from `typeof` of a prop (#3981):
 * `const kind = typeof props.x`. Read in markup it rendered empty (Go and
 * Mojolicious failed at render time) where Hono renders `string`; every
 * template adapter refuses it (BF101), and `/* @client *\/` defers the read
 * (`const-typeof-prop-client`).
 */
export const fixture = createFixture({
  id: 'const-typeof-prop',
  description: 'A const initialized from typeof of a prop renders the type name (#3981)',
  escapes: [{ kind: 'client-directive', fixture: 'const-typeof-prop-client' }],
  source: `
export function ConstTypeofProp(props: { x: string }) {
  const kind = typeof props.x
  return <p>{kind}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->string<!--/--></p>
  `,
})
