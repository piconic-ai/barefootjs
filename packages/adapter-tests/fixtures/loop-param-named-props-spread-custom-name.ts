import { createFixture } from '../src/types'

/**
 * The props object has its own name (`function C(p)`) and a row binding is
 * named `p` (#3727): `{...p}` in the row spreads the row. A row named
 * `props`, which is not this component's props object, spreads the row too.
 */
export const fixture = createFixture({
  id: 'loop-param-named-props-spread-custom-name',
  description: 'A row binding named like a custom props object name spreads the row, not the component props',
  source: `
type Row = { label: string; title: string }
export function LoopParamNamedPropsSpreadCustomName(p: { label: string; rows: Row[] }) {
  return (
    <div data-root={p.label}>
      <ul>{p.rows.map((p) => <li key={p.label}><span {...p} /></li>)}</ul>
      <ol>{p.rows.map((props) => <li key={props.label}><span {...props} /></li>)}</ol>
    </div>
  )
}
`,
  props: { label: 'ROOT', rows: [{ label: 'a', title: 'ta' }, { label: 'b', title: 'tb' }] },
  expectedHtml: `
    <div bf-s="test" bf="s4" data-root="ROOT">
      <ul bf="s1">
        <li data-key="a"><span bf="s0" label="a" title="ta"></span></li>
        <li data-key="b"><span bf="s0" label="b" title="tb"></span></li>
      </ul>
      <ol bf="s3">
        <li data-key="a"><span bf="s2" label="a" title="ta"></span></li>
        <li data-key="b"><span bf="s2" label="b" title="tb"></span></li>
      </ol>
    </div>
  `,
})
