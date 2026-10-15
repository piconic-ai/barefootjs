import { createFixture } from '../src/types'

/**
 * Arithmetic over an optional number prop the caller omits (#3474). JS reads
 * the omitted prop as `undefined`, so `missing * 2` is `NaN`. A template
 * engine holds an omitted prop and a `null` one as the same nil and reads it
 * as `0`, so every DSL adapter renders `0` / `1` here. Declared in each
 * adapter's `renderDivergences` under `omitted-optional-number-arithmetic`.
 */
export const fixture = createFixture({
  id: 'omitted-optional-number-arithmetic',
  description: 'Arithmetic over an omitted optional number prop (undefined → NaN)',
  source: `
export function OmittedOptionalNumberArithmetic(props: { missing?: number }) {
  return (
    <p data-missing={props.missing * 2}>
      <span>{props.missing + 1}</span>
    </p>
  )
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s2" data-missing="NaN"><span bf="s1"><!--bf:s0-->NaN<!--/--></span></p>
  `,
})
