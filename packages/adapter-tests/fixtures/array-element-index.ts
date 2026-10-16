import { createFixture } from '../src/types'

/**
 * A numeric index on an array value: a prop (`pair[1]`), an element of an
 * element (`groups[0][1]`), a loop row whose type is itself an array
 * (`entries[0]`) as the row key, an attribute, text and a condition, and the
 * outer row read from a nested loop.
 *
 * Go Template lowered every such read to a struct field (`.Field0`), which
 * is no field of a `[]string`, so html/template failed the render; a
 * condition emitted `.Groups.0.0`, which does not parse (#3497).
 */
export const fixture = createFixture({
  id: 'array-element-index',
  description: 'numeric index reads on a prop array, a nested array and an array-typed loop row',
  source: `
export function ArrayElementIndex({ pair, groups }: { pair: string[]; groups: string[][] }) {
  return (
    <div>
      <p data-second={pair[1]}>{pair[0]}-{groups[0][1]}</p>
      {groups[1][0] === 'c' ? <i>third</i> : <i>other</i>}
      <ul>
        {groups.map((entries) => (
          <li key={entries[0]} data-last={entries[1]}>
            {entries[0]}
            {entries[1] === 'b' && <u>b</u>}
            {entries.map((e) => <b key={e} title={entries[0]}>{e}</b>)}
          </li>
        ))}
      </ul>
    </div>
  )
}
`,
  props: { pair: ['x', 'y'], groups: [['a', 'b'], ['c', 'd']] },
  expectedHtml: `
    <div bf-s="test" bf="s10">
      <p bf="s2" data-second="y"><!--bf:s0-->x<!--/-->-<!--bf:s1-->b<!--/--></p>
      <i bf-c="s3">third</i>
      <ul bf="s9">
        <li bf="s8" data-key="a" data-last="b">
          <!--bf:s4-->a<!--/-->
          <u bf-c="s5">b</u>
          <b bf="s7" data-key-1="a" title="a"><!--bf:s6-->a<!--/--></b>
          <b bf="s7" data-key-1="b" title="a"><!--bf:s6-->b<!--/--></b>
        </li>
        <li bf="s8" data-key="c" data-last="d">
          <!--bf:s4-->c<!--/-->
          <!--bf-cond-start:s5-->
          <!--bf-cond-end:s5-->
          <b bf="s7" data-key-1="c" title="c"><!--bf:s6-->c<!--/--></b>
          <b bf="s7" data-key-1="d" title="c"><!--bf:s6-->d<!--/--></b>
        </li>
      </ul>
    </div>
  `,
})
