import { createFixture } from '../src/types'

/**
 * A closed rest declaring `strokeWidth` and `strokewidth` on an SVG
 * `<path>`, beside an explicit `strokeWidth={3}` on either side of the
 * spread. The reference writes `strokeWidth` as `stroke-width` there and
 * `strokewidth` as it is: two attributes. So the explicit attribute matches
 * the rest's key by its exact name only: with only `strokewidth` passed,
 * both attributes render; with `strokeWidth` passed, the last write of
 * `stroke-width` renders.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-svg-case-keys',
  description: 'An explicit strokeWidth beside a closed rest declaring strokeWidth and strokewidth replaces only the strokeWidth key',
  source: `
import { StrokeAfter, StrokeBefore } from './stroke'
export function SpreadClosedRestSvgCaseKeys() {
  return (
    <div>
      <StrokeAfter strokewidth={2} />
      <StrokeBefore strokewidth={2} />
      <StrokeAfter strokeWidth={2} />
      <StrokeBefore strokeWidth={2} />
    </div>
  )
}
`,
  components: {
    './stroke.tsx': `
type Stroke = { strokeWidth?: number; strokewidth?: number }
export function StrokeAfter({ ...rest }: Stroke) {
  return <svg><path {...rest} strokeWidth={3} /></svg>
}
export function StrokeBefore({ ...rest }: Stroke) {
  return <svg><path strokeWidth={3} {...rest} /></svg>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <svg bf-s="test_s0"><path stroke-width="3" strokewidth="2"></path></svg>
      <svg bf-s="test_s1"><path stroke-width="3" strokewidth="2"></path></svg>
      <svg bf-s="test_s2"><path stroke-width="3"></path></svg>
      <svg bf-s="test_s3"><path stroke-width="2"></path></svg>
    </div>
  `,
})
