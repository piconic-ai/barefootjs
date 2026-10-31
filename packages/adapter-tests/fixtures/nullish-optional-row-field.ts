import { createFixture } from '../src/types'

/**
 * `??` over an optional scalar field of a typed loop row (#3824 step 7): a
 * present `''` / `0` is not nullish and is kept; an omitted field reads
 * `undefined` and takes the fallback. Read as `t.s` in an attribute and a
 * text child, and destructured in the row param.
 */
export const fixture = createFixture({
  id: 'nullish-optional-row-field',
  description: 'An omitted optional row field takes the ?? fallback and a present "" or 0 is kept',
  source: `
export function NullishOptionalRowField(props: { rows: { k: string; s?: string; m?: number }[] }) {
  return (
    <div>
      <ul>{props.rows.map(t => <li key={t.k} data-s={t.s ?? 'fb'}>{t.s ?? 'fb'}|{t.m ?? 'fb'}</li>)}</ul>
      <ol>{props.rows.map(({ k, s, m }) => <li key={k}>{s ?? 'fb'}|{m ?? 'fb'}</li>)}</ol>
    </div>
  )
}
`,
  props: {
    rows: [
      { k: 'empty', s: '', m: 0 },
      { k: 'omitted' },
      { k: 'set', s: 's', m: 2 },
    ],
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s3">
        <li bf="s2" data-key="empty" data-s=""><!--bf:s0--><!--/-->|<!--bf:s1-->0<!--/--></li>
        <li bf="s2" data-key="omitted" data-s="fb"><!--bf:s0-->fb<!--/-->|<!--bf:s1-->fb<!--/--></li>
        <li bf="s2" data-key="set" data-s="s"><!--bf:s0-->s<!--/-->|<!--bf:s1-->2<!--/--></li>
      </ul>
      <ol bf="s6">
        <li data-key="empty"><!--bf:s4--><!--/-->|<!--bf:s5-->0<!--/--></li>
        <li data-key="omitted"><!--bf:s4-->fb<!--/-->|<!--bf:s5-->fb<!--/--></li>
        <li data-key="set"><!--bf:s4-->s<!--/-->|<!--bf:s5-->2<!--/--></li>
      </ol>
    </div>
  `,
})
