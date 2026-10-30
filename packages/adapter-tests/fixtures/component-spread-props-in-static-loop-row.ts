import { createFixture } from '../src/types'

/**
 * `{...props}` onto a child component in a row of a `.map()` over a local
 * constant array (#3713): `size` comes before the spread, so the caller's
 * `size` wins; `label` comes after it, so the row's own value wins.
 */
export const fixture = createFixture({
  id: 'component-spread-props-in-static-loop-row',
  description: 'A props spread onto a child component in a static-array loop row',
  source: `
import { Tag } from './tag'
export function StaticList(props: { tone?: string; size?: string; label?: string }) {
  const fixed = ['x', 'y']
  return <nav>{fixed.map((it) => <Tag key={it} size="s" {...props} label={it} />)}</nav>
}
`,
  components: {
    './tag.tsx': `
export function Tag(props: { tone?: string; size?: string; label?: string }) {
  return <span data-tone={props.tone} data-size={props.size}>{props.label}:{props.tone ? 'toned' : 'plain'}</span>
}
`,
  },
  props: { tone: 'warm', size: 'l', label: 'ignored' },
  expectedHtml: `
    <nav bf-s="test" bf="s1">
      <span bf-s="Tag_*" bf="s2" data-key="x" data-size="l" data-tone="warm"><!--bf:s0-->x<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--></span>
      <span bf-s="Tag_*" bf="s2" data-key="y" data-size="l" data-tone="warm"><!--bf:s0-->y<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--></span>
    </nav>
  `,
})
