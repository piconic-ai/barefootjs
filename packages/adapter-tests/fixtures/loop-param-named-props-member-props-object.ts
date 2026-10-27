import { createFixture } from '../src/types'

/**
 * Sibling of `loop-param-named-props-member` on a component that takes its
 * props as one object named `props`: a `.map()` row parameter also named
 * `props` shadows it inside the row only. The loop's array and the reads
 * outside the loop (`props.rows`, `props.label`) are the component's props;
 * the reads inside the row are the row's members, including an optional
 * member read as an attribute (`data-tone`): the component's own optional
 * `tone`, which the caller leaves out, must not drop it. A second loop
 * destructures a field named `props` out of each row (`({ props }) => …`),
 * and a third declares a row-local `const props`, each shadowing the
 * component's props the same way.
 */
export const fixture = createFixture({
  id: 'loop-param-named-props-member-props-object',
  description: 'A .map() row parameter named props shadows a props-object component\'s props inside the row only',
  source: `
type Row = { label: string; tone?: string }
type Group = { id: string; props: Row }
export function LoopParamNamedPropsMemberPropsObject(props: { rows: Row[]; groups: Group[]; label: string; tone?: string }) {
  return (
    <div title={props.label}>
      <ul>
        {props.rows.map((props) => (
          <li key={props.label} title={props.label} data-tone={props.tone}>{props.label}</li>
        ))}
      </ul>
      <ol>
        {props.groups.map(({ id, props }) => (
          <li key={id}>{props.label}</li>
        ))}
      </ol>
      <section>
        {props.rows.map((row) => {
          const props = row
          return <b key={row.label}>{props.label}</b>
        })}
      </section>
      <p>{props.label}</p>
    </div>
  )
}
`,
  props: {
    rows: [{ label: 'a', tone: 'warm' }, { label: 'b', tone: 'cool' }],
    groups: [{ id: 'g1', props: { label: 'x' } }, { id: 'g2', props: { label: 'y' } }],
    label: 'ROOT',
  },
  expectedHtml: `
    <div bf-s="test" bf="s11" title="ROOT">
      <ul bf="s2">
        <li bf="s1" data-key="a" data-tone="warm" title="a"><!--bf:s0-->a<!--/--></li>
        <li bf="s1" data-key="b" data-tone="cool" title="b"><!--bf:s0-->b<!--/--></li>
      </ul>
      <ol bf="s5">
        <li bf="s4" data-key="g1"><!--bf:s3-->x<!--/--></li>
        <li bf="s4" data-key="g2"><!--bf:s3-->y<!--/--></li>
      </ol>
      <section bf="s8">
        <b bf="s7" data-key="a"><!--bf:s6-->a<!--/--></b>
        <b bf="s7" data-key="b"><!--bf:s6-->b<!--/--></b>
      </section>
      <p bf="s10"><!--bf:s9-->ROOT<!--/--></p>
    </div>
  `,
})
