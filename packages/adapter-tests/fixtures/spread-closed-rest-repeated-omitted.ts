import { createFixture } from '../src/types'

/**
 * A closed rest spread twice with no earlier write (`<p {...rest}
 * {...rest}>`), and the caller omits every optional key. The second
 * expansion reads `rest.id ?? (rest.id)` (the first expansion is its
 * earlier write), which is `undefined`, so no attribute renders, as for a
 * bare `rest.id`. The same holds for a rest key read inside a larger value:
 * an earlier attribute that is the rest's fallback (`title={rest.id}
 * {...rest}`), a ternary branch (`on ? rest.id : 'x'`), and a loop row's
 * element. A boolean key and a component's props are unaffected. Sibling:
 * `spread-closed-rest-repeated-present` (the keys present),
 * `spread-body-rest-repeated-omitted` (a body rest).
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-repeated-omitted',
  description: 'A repeated closed rest spread, or a rest key read inside a larger value, renders no attribute for an omitted key',
  source: `
import { Child } from './child'
type P = { id?: string; title?: string; tabIndex?: number; hidden?: boolean; on?: boolean; rows?: { k: number }[] }
export function SpreadClosedRestRepeatedOmitted({ on, rows = [{ k: 1 }], ...rest }: P) {
  return (
    <div>
      <p {...rest} {...rest}>a</p>
      <p title={rest.id} {...rest}>b</p>
      <p title={on ? rest.id : 'x'}>c</p>
      <ul>{rows.map(r => <li key={r.k} {...rest} {...rest}>{r.k}</li>)}</ul>
      <Child {...rest} {...rest} />
    </div>
  )
}
`,
  components: {
    './child.tsx': `
export function Child({ id, title }: { id?: string; title?: string }) {
  return <span id={id} title={title}>c</span>
}
`,
  },
  props: { on: true },
  expectedHtml: `
    <div bf-s="test">
      <p>a</p>
      <p>b</p>
      <p bf="s0">c</p>
      <ul bf="s2"><li data-key="1"><!--bf:s1-->1<!--/--></li></ul>
      <span bf-s="test_s3" bf="s0">c</span>
    </div>
  `,
})
