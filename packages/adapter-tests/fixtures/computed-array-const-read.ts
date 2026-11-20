import { createFixture } from '../src/types'

/**
 * A component-scope array const whose elements read a prop (#3954): a template
 * has no binding for the const, so a read of its `length`, an element or a
 * method rendered an unbound name (an empty value, or a render error on Go).
 * The elements are lowered where the const is read, as if written there: in
 * text and attribute position, in a loop row (also where the row param shadows
 * the const's name), as a child prop and in a condition.
 */
export const fixture = createFixture({
  id: 'computed-array-const-read',
  description: 'A component-scope array const with prop-derived elements is read through its length, an index and a join (#3954)',
  source: `
function Kid(props: { n: number }) {
  return <i>{props.n}</i>
}

export function ComputedArrayConstRead(props: { rows: string[]; items?: string[]; tag?: string }) {
  const { items = ['a', 'b'], tag = 'x' } = props
  const local = [items.length, tag, 'z']
  return (
    <div>
      <p data-n={local.length}>{local.length}|{local[0]}|{local[1]}|{local.join('-')}</p>
      <ul>{props.rows.map(r => <li key={r}>{r}{local.length}</li>)}</ul>
      <ul>{props.rows.map(local => <li key={local}>{local}</li>)}</ul>
      <Kid n={local.length} />
      {local.length > 2 ? <b>{local[1]}</b> : <b>none</b>}
    </div>
  )
}
`,
  props: { rows: ['r1', 'r2'] },
  expectedHtml: `
    <div bf-s="test" bf="s16">
      <p bf="s4" data-n="3"><!--bf:s0-->3<!--/-->|<!--bf:s1-->2<!--/-->|<!--bf:s2-->x<!--/-->|<!--bf:s3-->2-x-z<!--/--></p>
      <ul bf="s8">
        <li bf="s7" data-key="r1"><!--bf:s5-->r1<!--/--><!--bf:s6-->3<!--/--></li>
        <li bf="s7" data-key="r2"><!--bf:s5-->r2<!--/--><!--bf:s6-->3<!--/--></li>
      </ul>
      <ul bf="s11">
        <li bf="s10" data-key="r1"><!--bf:s9-->r1<!--/--></li>
        <li bf="s10" data-key="r2"><!--bf:s9-->r2<!--/--></li>
      </ul>
      <i bf-s="test_s12" bf="s1"><!--bf:s0-->3<!--/--></i>
      <b bf-c="s13" bf="s15"><!--bf:s14-->x<!--/--></b>
    </div>
  `,
  dataPoints: [
    { name: 'passed', props: { rows: ['q'], items: ['p', 'q', 'r'], tag: 't' } },
  ],
})
