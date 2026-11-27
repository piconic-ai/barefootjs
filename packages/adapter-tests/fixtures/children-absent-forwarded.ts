import { createFixture } from '../src/types'

/**
 * A component that forwards its children as `children={props.children}` to
 * a child that tests them against `undefined`, called without children and
 * with children, next to a direct call without children. The child of the
 * call without children reads `undefined` (#3987).
 */
export const fixture = createFixture({
  id: 'children-absent-forwarded',
  description: 'Children forwarded from a call without children read as undefined',
  source: `
import { Check, Outer } from './note'
export function Host() {
  return <div><Check /><Outer /><Outer><i>o</i></Outer></div>
}
`,
  components: {
    './note.tsx': `
export function Check(props: { children?: unknown }) {
  return <p>{props.children === undefined ? 'fallback' : 'children'}</p>
}
export function Outer(props: { children?: unknown }) {
  return <section><Check children={props.children} /></section>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf-s="test_s0">fallback</p>
      <section bf-s="test_s1"><p bf-s="test_s1_s0">fallback</p></section>
      <section bf-s="test_s2"><p bf-s="test_s2_s0">children</p></section>
    </div>
  `,
})
