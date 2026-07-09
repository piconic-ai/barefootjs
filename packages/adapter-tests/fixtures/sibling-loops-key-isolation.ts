import { createFixture } from '../src/types'

/**
 * Two independent `.map()` calls as SIBLINGS under the same parent
 * (neither nested inside the other). Pins that a per-adapter
 * save/restore around the first loop's `data-key` depth doesn't leak
 * into the second — both must render plain `data-key` (depth 0), not
 * have the second incorrectly inherit a stale depth from the first.
 */
export const fixture = createFixture({
  id: 'sibling-loops-key-isolation',
  description: 'Two sibling top-level loops each render plain data-key',
  source: `
function SiblingLoopsKeyIsolation({ fruits, veggies }: { fruits: string[]; veggies: string[] }) {
  return (
    <div>
      <ul>
        {fruits.map(f => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <ul>
        {veggies.map(v => (
          <li key={v}>{v}</li>
        ))}
      </ul>
    </div>
  )
}
export { SiblingLoopsKeyIsolation }
`,
  props: {
    fruits: ['apple', 'plum'],
    veggies: ['carrot'],
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1">
        <li data-key="apple"><!--bf:s0-->apple<!--/--></li>
        <li data-key="plum"><!--bf:s0-->plum<!--/--></li>
      </ul>
      <ul bf="s3"><li data-key="carrot"><!--bf:s2-->carrot<!--/--></li></ul>
    </div>
  `,
})
