import { createFixture } from '../src/types'

/**
 * A loop row's optional member bound to an element attribute
 * (`data-tone={r.tone}`) is omitted when the row lacks the member or holds
 * `null`, as Hono omits any `undefined` / `null` attribute. A present value
 * renders, `''` and `0` included. Covers `data-*`, `class`, `className`,
 * `title`, a boolean attribute (`disabled`, absent, `false` and `true`), a
 * number member, a member of a required nested object (`r.meta.tone`) and
 * of an optional one (`r.extra?.tone`), and the member as a text child,
 * which renders empty. The signal-array, destructured-row and nested-loop
 * forms are `loop-row-absent-optional-member-attr-sources`, the typed
 * module const `loop-row-absent-optional-member-attr-module-const`, and a
 * boolean member as a plain attribute value `loop-row-boolean-member-attr`.
 */
export const fixture = createFixture({
  id: 'loop-row-absent-optional-member-attr',
  description: 'An absent or null optional loop-row member bound to an attribute omits the attribute',
  source: `
type Meta = { tone?: string }
type Row = { id: number; tone?: string | null; n?: number; off?: boolean; meta: Meta; extra?: Meta }
export function LoopRowAbsentOptionalMemberAttr(props: { rows: Row[] }) {
  return (
    <ul>
      {props.rows.map((r) => (
        <li key={r.id} data-tone={r.tone} class={r.tone} title={r.tone} data-n={r.n}>
          <span className={r.tone} data-meta={r.meta.tone} data-extra={r.extra?.tone}>{r.tone}</span>
          <button disabled={r.off}>b</button>
        </li>
      ))}
    </ul>
  )
}
`,
  props: {
    rows: [
      { id: 1, tone: 'x', n: 1, off: true, meta: { tone: 'm' }, extra: { tone: 'e' } },
      { id: 2, meta: {} },
      { id: 3, tone: '', n: 0, off: false, meta: { tone: '' }, extra: {} },
      { id: 4, tone: null, meta: {} },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s4">
      <li bf="s3" class="x" data-key="1" data-n="1" data-tone="x" title="x">
        <span bf="s1" class="x" data-extra="e" data-meta="m"><!--bf:s0-->x<!--/--></span>
        <button bf="s2" disabled>b</button>
      </li>
      <li bf="s3" data-key="2">
        <span bf="s1"><!--bf:s0--><!--/--></span>
        <button bf="s2">b</button>
      </li>
      <li bf="s3" class="" data-key="3" data-n="0" data-tone="" title="">
        <span bf="s1" class="" data-meta=""><!--bf:s0--><!--/--></span>
        <button bf="s2">b</button>
      </li>
      <li bf="s3" data-key="4">
        <span bf="s1"><!--bf:s0--><!--/--></span>
        <button bf="s2">b</button>
      </li>
    </ul>
  `,
})
