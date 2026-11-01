import { createFixture } from '../src/types'

/**
 * A component-body destructure of the rest props (`const { tone } = rest`)
 * binds each name to the prop the caller passed, as JS does. An omitted
 * prop (`size`) reads `undefined`.
 */
export const fixture = createFixture({
  id: 'body-destructure-rest-props',
  description: 'a body destructure of the rest props binds the props the caller passed',
  source: `
export function BodyDestructureRestProps({ title, ...rest }: { title: string; tone: string; size?: string; n: number }) {
  const { tone, size, n } = rest
  return (
    <div class={tone}>
      {title}-{size}-{n}
      {n > 1 ? <b>big</b> : <i>small</i>}
      {size && <s>{size}</s>}
    </div>
  )
}
`,
  props: { title: 'Hi', tone: 'info', n: 3 },
  expectedHtml: `
    <div bf-s="test" bf="s7" class="info"><!--bf:s0-->Hi<!--/-->-<!--bf:s1--><!--/-->-<!--bf:s2-->3<!--/--><b bf-c="s3">big</b><!--bf-cond-start:s4--><!--bf-cond-end:s4--></div>
  `,
})
