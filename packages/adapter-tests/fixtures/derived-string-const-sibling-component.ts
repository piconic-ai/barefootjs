import { createFixture } from '../src/types'

/**
 * Three components in one file, each reading its own derived string const
 * (`root`, `here`, `tag`) in an attribute and in text (#3737). Each const is
 * computed from that component's own prop, so a component that loses its
 * const renders an empty attribute and empty text. The entry component is
 * declared first, so it is not the last component the adapter compiles, and
 * `Badge` is rendered twice with a different result each time.
 */
export const fixture = createFixture({
  id: 'derived-string-const-sibling-component',
  description: 'Each component of a multi-component file renders its own derived string const',
  source: `
export function Card(props: { kind: string; step: string; tone: string }) {
  const root = ['doc', 'api'].includes(props.kind) ? 'known' : 'other'
  return (
    <a href={root}>
      {root}
      <Crumb step={props.step} />
      <Badge tone={props.tone} />
      <Badge tone="info" />
    </a>
  )
}

function Crumb(props: { step: string }) {
  const here = ['a', 'b'].includes(props.step) ? 'early' : 'late'
  return <i title={here}>{here}</i>
}

function Badge(props: { tone: string }) {
  const tag = ['warn', 'error'].includes(props.tone) ? 'loud' : 'quiet'
  return <em title={tag}>{tag}</em>
}
`,
  props: { kind: 'api', step: 'z', tone: 'warn' },
  componentName: 'Card',
  expectedHtml: `
    <a bf-s="test" bf="s4" href="known">
      <!--bf:s0-->known<!--/-->
      <i bf-s="test_s1" bf="s1" title="late"><!--bf:s0-->late<!--/--></i>
      <em bf-s="test_s2" bf="s1" title="loud"><!--bf:s0-->loud<!--/--></em>
      <em bf-s="test_s3" bf="s1" title="quiet"><!--bf:s0-->quiet<!--/--></em>
    </a>
  `,
})
