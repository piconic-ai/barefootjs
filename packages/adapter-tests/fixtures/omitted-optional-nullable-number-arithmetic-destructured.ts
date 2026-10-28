import { createFixture } from '../src/types'

/**
 * The destructured form of `omitted-optional-nullable-number-arithmetic`:
 * a binding typed `n?: number | null` is refused with BF101 on every
 * template adapter alike. A destructured binding's union type is carried as
 * `ParamInfo.declaredType`, so the nil classification reads it as it reads
 * the `props.n` form. The rewrite is
 * `omitted-optional-number-arithmetic-destructured`.
 */
export const fixture = createFixture({
  id: 'omitted-optional-nullable-number-arithmetic-destructured',
  description: 'Arithmetic over an omitted destructured optional prop typed number | null',
  source: `
export function OmittedOptionalNullableNumberArithmeticDestructured({ n }: { n?: number | null }) {
  return (
    <p data-n={n * 2}>
      <span>{n + 1}</span>
    </p>
  )
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s2" data-n="NaN"><span bf="s1"><!--bf:s0-->NaN<!--/--></span></p>
  `,
  escapes: [{ kind: 'rewrite', fixture: 'omitted-optional-number-arithmetic-destructured' }],
})
