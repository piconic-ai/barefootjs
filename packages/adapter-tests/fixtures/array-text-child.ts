import { createFixture } from '../src/types'

/**
 * An array value in child position (`<p>{xs}</p>`): JSX renders its items
 * one after another, with no separator. A template that stringifies the
 * value prints something else (limitation `array-text-child`).
 */
export const fixture = createFixture({
  id: 'array-text-child',
  description: 'An array in child position renders its items one after another',
  source: `
export function ArrayTextChild({ xs }: { xs: string[] }) {
  return <p>{xs}</p>
}
`,
  props: { xs: ['a', 'b'] },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->ab<!--/--></p>
  `,
})
