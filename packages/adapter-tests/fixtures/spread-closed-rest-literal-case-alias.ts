import { createFixture } from '../src/types'

/**
 * A literal that spells a closed rest's key in another letter case:
 * `tabindex="1"` beside `{...rest}` whose props type declares `tabIndex`.
 * The rest expands into one attribute per key, written with the key's
 * spelling (`tabIndex`), which a browser takes for the same attribute as
 * the literal. JSX keeps the last write: before the spread the rest's value
 * wins when the caller passes it and the literal stays when it does not;
 * after the spread the literal wins.
 *
 * `TwoKeys` declares both spellings: each is the caller's own write, so
 * passing one renders it once and neither is the other's fallback. A key
 * outside ASCII is `spread-closed-rest-non-ascii-key`.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-literal-case-alias',
  description: 'A literal tabindex before or after a closed rest declaring tabIndex renders the attribute once, with the last write',
  source: `
import { Before } from './before'
import { After } from './after'
import { TwoKeys } from './two-keys'
export function SpreadClosedRestLiteralCaseAlias() {
  return (
    <div>
      <Before tabIndex={2} />
      <Before />
      <After tabIndex={2} />
      <TwoKeys tabIndex={2} />
    </div>
  )
}
`,
  components: {
    './before.tsx': `
export function Before({ ...rest }: { tabIndex?: number }) {
  return <p tabindex="1" {...rest}>a</p>
}
`,
    './two-keys.tsx': `
export function TwoKeys({ ...rest }: { tabIndex?: number; tabindex?: number }) {
  return <p {...rest}>c</p>
}
`,
    './after.tsx': `
export function After({ ...rest }: { tabIndex?: number }) {
  return <p {...rest} tabindex="1">b</p>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf-s="test_s0" tabIndex="2">a</p>
      <p bf-s="test_s1" tabIndex="1">a</p>
      <p bf-s="test_s2" tabindex="1">b</p>
      <p bf-s="test_s3" tabIndex="2">c</p>
    </div>
  `,
})
