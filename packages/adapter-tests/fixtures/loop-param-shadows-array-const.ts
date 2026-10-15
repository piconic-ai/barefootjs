import { createFixture } from '../src/types'

/**
 * A `.map()` callback param shadowing a component-scope computed array const,
 * used as a nested loop's source (`groups.map((entries) => entries.map(…))`
 * with an outer `const entries = Object.keys(…)`).
 *
 * The nested loop iterates the row's own `entries`, so nothing about the
 * outer const reaches the template. Every DSL adapter but ERB still tested
 * the loop source against `localConstants` without asking whether a loop
 * binding shadows it, and refused the loop with BF101 (#3473).
 *
 * The row key is the index: Go Template lowers `entries[0]` on a
 * `string[][]` row to a struct field read (`.Field0`), which is a separate
 * bug this fixture does not cover.
 */
export const fixture = createFixture({
  id: 'loop-param-shadows-array-const',
  description: '.map() param shadowing a computed array const iterates the row value, not the outer const',
  source: `
export function ArrayConstShadow({ groups, labels }: { groups: string[][]; labels: Record<string, string> }) {
  const entries = Object.keys(labels)
  return (
    <ul>
      {groups.map((entries, i) => (
        <li key={i}>{entries.map((e) => <b key={e}>{e}</b>)}</li>
      ))}
    </ul>
  )
}
`,
  props: { groups: [['a', 'b'], ['c']], labels: { x: '1' } },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li bf="s1" data-key="0">
        <b data-key-1="a"><!--bf:s0-->a<!--/--></b>
        <b data-key-1="b"><!--bf:s0-->b<!--/--></b>
      </li>
      <li bf="s1" data-key="1"><b data-key-1="c"><!--bf:s0-->c<!--/--></b></li>
    </ul>
  `,
})
