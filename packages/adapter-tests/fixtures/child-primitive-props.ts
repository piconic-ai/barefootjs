import { createFixture } from '../src/types'

/**
 * Number and boolean literals passed as child-component props
 * (`count={5}` / `active={true}`). String props dominate the corpus;
 * this pins that primitives keep their type through each adapter's
 * props serialisation (Go struct fields, Ruby/Perl hashes, bf-p JSON)
 * — `count="5"` vs `count={5}` diverge in Go's typed structs.
 */
export const fixture = createFixture({
  id: 'child-primitive-props',
  description: 'Numeric and boolean literal props on a child component',
  source: `
import { Badge } from './Badge'
export function ChildPrimitiveProps() {
  return (
    <div>
      <Badge label="mail" count={5} active={true} />
      <Badge label="spam" count={0} active={false} />
    </div>
  )
}
`,
  components: {
    './Badge': `
export function Badge(props: { label: string; count: number; active: boolean }) {
  return (
    <span data-active={props.active}>
      {props.label}: {props.count}
    </span>
  )
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <span bf-s="test_s0" bf="s2" data-active="true"><!--bf:s0-->mail<!--/-->: <!--bf:s1-->5<!--/--></span>
      <span bf-s="test_s1" bf="s2" data-active="false"><!--bf:s0-->spam<!--/-->: <!--bf:s1-->0<!--/--></span>
    </div>
  `,
})
