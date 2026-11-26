import { createFixture } from '../src/types'

/**
 * Closed rest keys that spell the boolean attribute `hidden` in two letter
 * cases. Its presence, not its value, is what renders, so a key is never
 * matched to another by the attribute it folds to: the rest's `hidden:
 * false` renders nothing and `HIDDEN: "yes"` renders as it is, and a bare
 * `hidden` before a rest declaring `HIDDEN` stays beside it.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-boolean-case-keys',
  description: 'Closed rest keys hidden and HIDDEN render as separate writes, beside a bare hidden',
  source: `
import { Hidden, BareHidden } from './hidden'
export function SpreadClosedRestBooleanCaseKeys() {
  return (
    <div>
      <Hidden hidden={false} HIDDEN="yes" />
      <BareHidden />
      <BareHidden HIDDEN="yes" />
    </div>
  )
}
`,
  components: {
    './hidden.tsx': `
export function Hidden({ ...rest }: { hidden?: boolean; HIDDEN?: string }) {
  return <p {...rest}>h</p>
}
export function BareHidden({ ...rest }: { HIDDEN?: string }) {
  return <p hidden {...rest}>b</p>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <p HIDDEN="yes" bf-s="test_s0">h</p>
      <p bf-s="test_s1" hidden>b</p>
      <p HIDDEN="yes" bf-s="test_s2" hidden>b</p>
    </div>
  `,
})
