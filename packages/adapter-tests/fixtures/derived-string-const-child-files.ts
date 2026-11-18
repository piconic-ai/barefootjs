import { createFixture } from '../src/types'

/**
 * The cross-file form of `derived-string-const-sibling-component` (#3737):
 * the parent and two child files each declare one component that reads its
 * own derived string const (`root`, `here`, `tag`) in an attribute and in
 * text. Neither child file is the last one compiled before the other's
 * types are generated, so a const taken from the last compiled component
 * leaves a child without its own.
 */
export const fixture = createFixture({
  id: 'derived-string-const-child-files',
  description: 'Components in separate files each render their own derived string const',
  source: `
import { Crumb } from './crumb'
import { Badge } from './badge'

export function Panel(props: { kind: string; step: string; tone: string }) {
  const root = ['doc', 'api'].includes(props.kind) ? 'known' : 'other'
  return (
    <section title={root}>
      {root}
      <Crumb step={props.step} />
      <Badge tone={props.tone} />
      <Badge tone="info" />
    </section>
  )
}
`,
  components: {
    './crumb.tsx': `
export function Crumb(props: { step: string }) {
  const here = ['a', 'b'].includes(props.step) ? 'early' : 'late'
  return <i title={here}>{here}</i>
}
`,
    './badge.tsx': `
export function Badge(props: { tone: string }) {
  const tag = ['warn', 'error'].includes(props.tone) ? 'loud' : 'quiet'
  return <em title={tag}>{tag}</em>
}
`,
  },
  props: { kind: 'web', step: 'a', tone: 'error' },
  expectedHtml: `
    <section bf-s="test" bf="s4" title="other">
      <!--bf:s0-->other<!--/-->
      <i bf-s="test_s1" bf="s1" title="early"><!--bf:s0-->early<!--/--></i>
      <em bf-s="test_s2" bf="s1" title="loud"><!--bf:s0-->loud<!--/--></em>
      <em bf-s="test_s3" bf="s1" title="quiet"><!--bf:s0-->quiet<!--/--></em>
    </section>
  `,
})
