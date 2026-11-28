import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `const-typeof-prop`: the const is read on the
 * client only, so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'const-typeof-prop-client',
  description: 'The client-directive escape of a const initialized from typeof of a prop',
  source: `
export function ConstTypeofPropClient(props: { x: string }) {
  const kind = typeof props.x
  return <p>{/* @client */ kind}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
