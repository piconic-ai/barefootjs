import { createFixture } from '../src/types'

/**
 * A no-substitution template-literal key on the props object
 * (`` props[`title`] ``) reads the same prop as `props['title']` and
 * `props.title`. Covers text, attribute, ternary, `&&`, a child prop, a
 * loop row, a template literal and `+` concatenation, the same key form in
 * a child that takes `props`, and template keys on a loop row
 * (`` row[`name`] ``) and on a destructured object prop
 * (`` meta[`k`] ``). The props are required: an omitted prop under `+` /
 * a template literal is a separate, known divergence.
 */
export const fixture = createFixture({
  id: 'props-template-literal-key-read',
  description: 'A no-substitution template-literal key read on props (props[`title`]) renders like props.title',
  source: `
import { Badge } from './badge'
import { Tag } from './tag'
export function PropsTemplateLiteralKeyRead(props: { title: string; count: number; on: boolean; items: string[]; rows: { name: string }[] }) {
  return (
    <div title={props[\`title\`]} data-n={props[\`count\`]}>
      <p>{props[\`title\`]}</p>
      <p>{props[\`on\`] ? 'yes' : 'no'}</p>
      {props[\`on\`] && <b>on</b>}
      <Badge label={props[\`title\`]} />
      <p>{\`t:\${props[\`title\`]}\`}</p>
      <p>{props[\`title\`] + '!'}</p>
      <ul>{props.items.map(item => <li key={item}>{item}-{props[\`title\`]}</li>)}</ul>
      <ol>{props.rows.map(row => <li key={row.name}>{row[\`name\`]}</li>)}</ol>
      <Tag text={props[\`title\`]} meta={{ k: 'm' }} />
    </div>
  )
}
`,
  components: {
    './badge.tsx': `
export function Badge(props: { label?: string }) {
  return <span>{props[\`label\`]}</span>
}
`,
    './tag.tsx': `
export function Tag({ text, meta }: { text?: string; meta: { k: string } }) {
  return <em data-k={meta[\`k\`]}>{text}|{meta[\`k\`]}</em>
}
`,
  },
  props: { title: 'X', count: 3, on: true, items: ['a', 'b'], rows: [{ name: 'r1' }, { name: 'r2' }] },
  dataPoints: [
    { name: 'off', props: { title: 'Y', count: 0, on: false, items: [], rows: [] } },
  ],
  expectedHtml: `
    <div bf-s="test" bf="s17" data-n="3" title="X">
      <p bf="s1"><!--bf:s0-->X<!--/--></p>
      <p bf="s3"><!--bf-cond-start:s2-->yes<!--bf-cond-end:s2--></p>
      <b bf-c="s4">on</b>
      <span bf-s="test_s5" bf="s1"><!--bf:s0-->X<!--/--></span>
      <p bf="s7"><!--bf:s6-->t:X<!--/--></p>
      <p bf="s9"><!--bf:s8-->X!<!--/--></p>
      <ul bf="s13">
        <li bf="s12" data-key="a"><!--bf:s10-->a<!--/-->-<!--bf:s11-->X<!--/--></li>
        <li bf="s12" data-key="b"><!--bf:s10-->b<!--/-->-<!--bf:s11-->X<!--/--></li>
      </ul>
      <ol bf="s15">
        <li data-key="r1"><!--bf:s14-->r1<!--/--></li>
        <li data-key="r2"><!--bf:s14-->r2<!--/--></li>
      </ol>
      <em bf-s="test_s16" bf="s2" data-k="m"><!--bf:s0-->X<!--/-->|<!--bf:s1-->m<!--/--></em>
    </div>
  `,
})
