import { createFixture } from '../src/types'

/**
 * `Object.entries(props.obj).map(([k, v]) => ...)` DIRECTLY in JSX —
 * iterating an object-shaped prop rather than an array. Combines a
 * well-known builtin (Object.entries) with a tuple destructure in the
 * loop param. Backends whose loop lowering only knows arrays must
 * either lower to their native map-iteration form or refuse loudly.
 */
export const fixture = createFixture({
  id: 'object-entries-map',
  description: 'Object.entries(prop).map with tuple destructure',
  source: `
function ObjectEntriesMap({ counts }: { counts: Record<string, number> }) {
  return (
    <ul>
      {Object.entries(counts).map(([word, n]) => (
        <li key={word}>{word}: {n}</li>
      ))}
    </ul>
  )
}
export { ObjectEntriesMap }
`,
  props: { counts: { apple: 3, banana: 5 } },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li data-key="apple"><!--bf:s0-->apple<!--/-->: <!--bf:s1-->3<!--/--></li>
      <li data-key="banana"><!--bf:s0-->banana<!--/-->: <!--bf:s1-->5<!--/--></li>
    </ul>
  `,
})
