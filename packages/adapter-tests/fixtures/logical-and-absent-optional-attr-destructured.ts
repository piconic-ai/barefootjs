import { createFixture } from '../src/types'

/**
 * An `&&` whose left operand is an absent optional prop yields `undefined`,
 * so an attribute bound to it is omitted, as JSX omits an `undefined`
 * attribute: directly, in a ternary branch, in a loop row and forwarded to
 * a child. A present `false` / `''` / `0` still prints.
 */
export const fixture = createFixture({
  id: 'logical-and-absent-optional-attr-destructured',
  description: 'An attribute bound to && over an absent optional prop is omitted',
  source: `
import { Label } from './label'
export function LogicalAndAbsentOptionalAttrDestructured({ on, label, count, off, items }: { on?: boolean; label?: string; count?: number; off?: boolean; items: string[] }) {
  return (
    <div data-on={on && 'y'} data-label={label && 'y'} data-count={count && 'y'} data-off={off && 'y'} data-pick={items.length ? (on && 'y') : 'x'} data-alt={on ? 'x' : label}>
      <Label value={on && 'y'} />
      <ul>{items.map(item => <li key={item} data-v={on && item}>{item}</li>)}</ul>
    </div>
  )
}
`,
  components: {
    './label.tsx': `
export function Label({ value }: { value?: boolean | string }) {
  return <i data-v={value}>x</i>
}
`,
  },
  props: { off: false, items: ['a', 'b'] },
  dataPoints: [
    { name: 'absent', props: { off: false, items: ['a', 'b'] } },
    { name: 'present', props: { on: true, label: 'L', count: 0, off: true, items: ['a'] } },
    { name: 'falsy', props: { on: false, label: '', count: 0, off: false, items: ['a'] } },
  ],
  expectedHtml: `
    <div bf-s="test" bf="s4" data-off="false">
      <i bf-s="test_s0" bf="s0">x</i>
      <ul bf="s3">
        <li bf="s2" data-key="a"><!--bf:s1-->a<!--/--></li>
        <li bf="s2" data-key="b"><!--bf:s1-->b<!--/--></li>
      </ul>
    </div>
  `,
})
