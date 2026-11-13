import { createFixture } from '../src/types'

/**
 * `{...props}` on an element inside a row that is itself named `props`
 * (#3727): the row binding shadows the component's props object, so the
 * spread writes the row's keys, not the component's own (`label` and `rows`
 * here, which a spread of the props object would put on every row). Rows
 * covered: a plain row, an inner loop's row, a destructured row field named
 * `props`, and a row-local `const props`. The component-level
 * `{...props}` outside any row still spreads the component's props.
 */
export const fixture = createFixture({
  id: 'loop-param-named-props-spread-element',
  description: 'A row binding named props spreads the row, not the component props, onto an element',
  source: `
type Row = { label: string; title: string }
type Group = { id: string; props: Row }
type Block = { id: string; rows: Row[] }
export function LoopParamNamedPropsSpreadElement(props: { label: string; rows: Row[]; groups: Group[]; blocks: Block[] }) {
  return (
    <div data-root={props.label}>
      <ul>{props.rows.map((props) => <li key={props.label}><span {...props} /></li>)}</ul>
      <ol>{props.blocks.map((block) => <li key={block.id}>{block.rows.map((props) => <i key={props.label} {...props} />)}</li>)}</ol>
      <dl>{props.groups.map(({ id, props }) => <dt key={id}><em {...props} /></dt>)}</dl>
      <section>{props.rows.map((row) => { const props = row; return <b key={row.label} {...props} /> })}</section>
    </div>
  )
}
`,
  props: {
    label: 'ROOT',
    rows: [{ label: 'a', title: 'ta' }, { label: 'b', title: 'tb' }],
    groups: [{ id: 'g1', props: { label: 'x', title: 'tx' } }, { id: 'g2', props: { label: 'y', title: 'ty' } }],
    blocks: [{ id: 'k1', rows: [{ label: 'p', title: 'tp' }] }, { id: 'k2', rows: [{ label: 'q', title: 'tq' }] }],
  },
  expectedHtml: `
    <div bf-s="test" bf="s9" data-root="ROOT">
      <ul bf="s1">
        <li data-key="a"><span bf="s0" label="a" title="ta"></span></li>
        <li data-key="b"><span bf="s0" label="b" title="tb"></span></li>
      </ul>
      <ol bf="s4">
        <li bf="s3" data-key="k1"><i bf="s2" data-key-1="p" label="p" title="tp"></i></li>
        <li bf="s3" data-key="k2"><i bf="s2" data-key-1="q" label="q" title="tq"></i></li>
      </ol>
      <dl bf="s6">
        <dt data-key="g1"><em bf="s5" label="x" title="tx"></em></dt>
        <dt data-key="g2"><em bf="s5" label="y" title="ty"></em></dt>
      </dl>
      <section bf="s8">
        <b bf="s7" data-key="a" label="a" title="ta"></b>
        <b bf="s7" data-key="b" label="b" title="tb"></b>
      </section>
    </div>
  `,
})
