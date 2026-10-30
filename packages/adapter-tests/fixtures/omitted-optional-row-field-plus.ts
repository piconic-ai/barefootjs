import { createFixture } from '../src/types'

/**
 * A `+` over an optional string row field (`id?: string`). The field is not
 * definitely a string: a row that omits it reads `undefined`, so
 * `o.id + '!'` is `"undefined!"` and `o.id + 1` is `NaN`, while a row that
 * has it concatenates (`"o1"`). The plain row and a destructured `{ id }`.
 */
export const fixture = createFixture({
  id: 'omitted-optional-row-field-plus',
  description: 'A + over an optional string row field renders undefined / NaN when the row omits it and concatenates when it has it',
  source: `
type Opt = { id?: string; n: number }

export function OmittedOptionalRowFieldPlus(props: { opts: Opt[] }) {
  return (
    <div>
      <p>{props.opts.map((o, i) => <u key={i}>{o.id + '!'}|{o.id + 1}</u>)}</p>
      <p>{props.opts.map(({ id, n }, i) => <u key={i}>{id + n}</u>)}</p>
    </div>
  )
}
`,
  props: {
    opts: [{ n: 1 }, { id: 'o', n: 2 }],
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s2">
        <u data-key="0"><!--bf:s0-->undefined!<!--/-->|<!--bf:s1-->NaN<!--/--></u>
        <u data-key="1"><!--bf:s0-->o!<!--/-->|<!--bf:s1-->o1<!--/--></u>
      </p>
      <p bf="s4">
        <u data-key="0"><!--bf:s3-->NaN<!--/--></u>
        <u data-key="1"><!--bf:s3-->o2<!--/--></u>
      </p>
    </div>
  `,
})
