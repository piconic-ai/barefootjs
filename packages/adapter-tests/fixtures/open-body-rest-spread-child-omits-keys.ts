import { createFixture } from '../src/types'

/**
 * The body-destructure twin of `open-rest-spread-child-omits-keys` (#3714):
 * an open-type rest bag bound by `const { title, ...rest } = props`, spread
 * onto a child component and through a local alias. The bag leaves out only
 * the key the destructure takes (`title`), not every key the props type
 * declares, so `tone` reaches the child.
 */
export const fixture = createFixture({
  id: 'open-body-rest-spread-child-omits-keys',
  description: 'An open rest bag bound in the component body leaves out only the keys its destructure takes',
  source: `
import { Tag } from './tag'
type CardProps = { title?: string; tone?: string; size?: string; [key: string]: unknown }
export function Card(props: CardProps) {
  const { title, ...rest } = props
  const bag = rest
  return (
    <div data-own={title}>
      <Tag {...rest} />
      <Tag tone="before" title="x" {...bag} />
    </div>
  )
}
`,
  components: {
    './tag.tsx': `
export function Tag(props: { title?: string; tone?: string; size?: string }) {
  return <b data-title={props.title} data-tone={props.tone} data-size={props.size}>tag</b>
}
`,
  },
  props: { title: 'T', tone: 'warm' },
  expectedHtml: `
    <div bf-s="test" bf="s2" data-own="T">
      <b bf-s="test_s0" bf="s0" data-tone="warm">tag</b>
      <b bf-s="test_s1" bf="s0" data-title="x" data-tone="warm">tag</b>
    </div>
  `,
})
