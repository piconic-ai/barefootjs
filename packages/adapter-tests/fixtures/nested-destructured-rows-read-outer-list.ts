import { createFixture } from '../src/types'

/**
 * Sibling of `nested-loop-filter-reads-outer-destructure-list` (#3397): both
 * the outer row (`{ id, label, tags, rows }`) and the middle row
 * (`{ id: rowId }`) destructure their item. The middle row reads the outer
 * `label`, and a loop inside it iterates the outer `tags`. Each nested row's
 * client JS reads its own bindings through its own accessor, so the outer
 * bindings still resolve to the outer row.
 */
export const fixture = createFixture({
  id: 'nested-destructured-rows-read-outer-list',
  description: 'A destructured middle row reads the outer destructured row label and iterates its list',
  source: `
export function NestedDestructuredRowsReadOuterList(props: {
  groups: { id: string; label: string; tags: string[]; rows: { id: string }[] }[]
}) {
  return (
    <ul>{props.groups.map(({ id, label, tags, rows }) => (
      <li key={id}>{rows.map(({ id: rowId }) => (
        <b key={rowId}><span>{label}</span><em>{tags.map(tag => <i key={tag}>{tag}</i>)}</em></b>
      ))}</li>
    ))}</ul>
  )
}
`,
  props: { groups: [{ id: 'g', label: 'G', tags: ['a', 'b'], rows: [{ id: 'r1' }, { id: 'r2' }] }] },
  expectedHtml: `
    <ul bf-s="test" bf="s4"><li bf="s3" data-key="g"><b data-key-1="r1"><span><!--bf:s0-->G<!--/--></span><em bf="s2"><i data-key-2="a"><!--bf:s1-->a<!--/--></i><i data-key-2="b"><!--bf:s1-->b<!--/--></i></em></b><b data-key-1="r2"><span><!--bf:s0-->G<!--/--></span><em bf="s2"><i data-key-2="a"><!--bf:s1-->a<!--/--></i><i data-key-2="b"><!--bf:s1-->b<!--/--></i></em></b></li></ul>
  `,
})
