import { createFixture } from '../src/types'

/**
 * A loop row named like the component's closed rest binding shadows it:
 * `{...rest}` inside the row spreads the row onto the element, and
 * `key={rest.id}` and the member reads (text, a child component's prop)
 * read the row, whose keys the component's rest type does not declare.
 */
export const fixture = createFixture({
  id: 'rest-binding-shadowed-by-loop-row',
  description: 'A loop row named like the component rest binding shadows it in spreads, keys and reads',
  source: `
import { Chip } from './chip'
export function RestRowShadow({ rows, ...rest }: { rows: { id: string; label: string }[]; tone?: string }) {
  return (
    <div data-tone={rest.tone}>
      <ul>{rows.map(rest => <li key={rest.id} {...rest}>{rest.label}</li>)}</ul>
      <ol>{rows.map(rest => <Chip key={rest.id} label={rest.label} />)}</ol>
    </div>
  )
}
`,
  components: {
    './chip.tsx': `
export function Chip(props: { label?: string }) {
  return <span>{props.label}</span>
}
`,
  },
  props: { rows: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], tone: 'outer' },
  expectedHtml: `
    <div bf-s="test" data-tone="outer">
      <ul bf="s2">
        <li bf="s1" data-key="a" id="a" label="A"><!--bf:s0-->A<!--/--></li>
        <li bf="s1" data-key="b" id="b" label="B"><!--bf:s0-->B<!--/--></li>
      </ul>
      <ol bf="s4">
        <span bf-s="Chip_*" bf="s1" data-key="a"><!--bf:s0-->A<!--/--></span>
        <span bf-s="Chip_*" bf="s1" data-key="b"><!--bf:s0-->B<!--/--></span>
      </ol>
    </div>
  `,
})
