import { createFixture } from '../src/types'

/**
 * A defaulted array prop called with an explicit `null` keeps `null` (the
 * default applies to an omitted prop only), and every coercion reads it as
 * `null`, not as an empty array: `String()` and a template literal print
 * `null`, `JSON.stringify` writes `null`, it is falsy, `?.length` is
 * `undefined`, and as a text child it renders nothing. An omitted prop takes
 * the empty-array default, which prints as `''` and is truthy.
 */
export const fixture = createFixture({
  id: 'defaulted-array-prop-null-coercion',
  description: 'A defaulted array prop set to null reads as null in String(), a template literal, JSON.stringify, a truthiness test and ?.length',
  source: `
export function DefaultedArrayPropNullCoercion({ items = [] }: { items?: string[] | null }) {
  return (
    <p>
      {String(items)}|{\`t-\${items}\`}|{JSON.stringify(items)}|{items ? 'truthy' : 'falsy'}|{items?.length ?? 'none'}|{items === null ? 'null' : 'set'}
    </p>
  )
}
`,
  props: { items: null },
  expectedHtml: `
    <p bf-s="test" bf="s6"><!--bf:s0-->null<!--/-->|<!--bf:s1-->t-null<!--/-->|<!--bf:s2-->null<!--/-->|<!--bf-cond-start:s3-->falsy<!--bf-cond-end:s3-->|<!--bf:s4-->none<!--/-->|<!--bf-cond-start:s5-->null<!--bf-cond-end:s5--></p>
  `,
  dataPoints: [
    { name: 'omitted', props: {} },
    { name: 'empty', props: { items: [] } },
    { name: 'given', props: { items: ['a', 'b'] } },
  ],
})
