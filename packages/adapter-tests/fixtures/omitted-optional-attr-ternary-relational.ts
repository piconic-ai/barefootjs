import { createFixture } from '../src/types'

/**
 * An omitted optional number compared only inside an attribute ternary
 * (#3750, the Go attribute-ternary gap). JS reads it as `undefined`, so
 * `n < 1` is false; a backend that reads the omitted prop as its type's
 * zero value would render `T`. The prop is read nowhere else, so nothing
 * but the comparison itself can make it nillable.
 */
export const fixture = createFixture({
  id: 'omitted-optional-attr-ternary-relational',
  description: 'An omitted optional number compared only in an attribute ternary reads undefined',
  source: `
export function OmittedOptionalAttrTernaryRelational(props: { n?: number; s?: string }) {
  return <i data-x={(props.n < 1) ? 'T' : 'F'} data-y={(props.s + '!') === 'undefined!' ? 'U' : 'E'} />
}
`,
  props: {},
  expectedHtml: `
    <i bf-s="test" bf="s0" data-x="F" data-y="U"></i>
  `,
})
