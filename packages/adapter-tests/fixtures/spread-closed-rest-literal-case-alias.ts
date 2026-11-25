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
 * A rest that declares both spellings (`tabIndex`, `tabindex`) writes one
 * attribute, the first spelling the caller passes, whichever it passes
 * (`TwoKeys`); neither key is the other's fallback. A literal after it
 * replaces it whichever keys the caller passes, none included
 * (`TwoKeysThenLiteral`), and so does an expression (`TwoKeysThenExpr`); a
 * literal before it stays only when the caller passes neither
 * (`LiteralThenTwoKeys`). A key outside ASCII is
 * `spread-closed-rest-non-ascii-key`.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-literal-case-alias',
  description: 'A literal tabindex before or after a closed rest declaring tabIndex renders the attribute once, with the last write',
  source: `
import { Before } from './before'
import { After } from './after'
import { TwoKeys, TwoKeysThenLiteral, TwoKeysThenExpr, LiteralThenTwoKeys } from './two-keys'
export function SpreadClosedRestLiteralCaseAlias() {
  return (
    <div>
      <Before tabIndex={2} />
      <Before />
      <After tabIndex={2} />
      <TwoKeys tabIndex={2} />
      <TwoKeys tabindex={3} />
      <TwoKeys tabIndex={2} tabindex={3} />
      <TwoKeysThenLiteral />
      <TwoKeysThenLiteral tabIndex={2} />
      <TwoKeysThenLiteral tabindex={3} />
      <TwoKeysThenLiteral tabIndex={2} tabindex={3} />
      <TwoKeysThenExpr tabIndex={2} />
      <LiteralThenTwoKeys />
      <LiteralThenTwoKeys tabIndex={2} />
      <LiteralThenTwoKeys tabindex={3} />
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
type Both = { tabIndex?: number; tabindex?: number }
export function TwoKeys({ ...rest }: Both) {
  return <p {...rest}>c</p>
}
export function TwoKeysThenLiteral({ ...rest }: Both) {
  return <p {...rest} tabindex="1">d</p>
}
export function TwoKeysThenExpr({ n = 7, ...rest }: { tabIndex?: number; tabindex?: number; n?: number }) {
  return <p {...rest} tabindex={n}>e</p>
}
export function LiteralThenTwoKeys({ ...rest }: Both) {
  return <p tabindex="1" {...rest}>f</p>
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
      <p bf-s="test_s4" tabIndex="3">c</p>
      <p bf-s="test_s5" tabIndex="2">c</p>
      <p bf-s="test_s6" tabindex="1">d</p>
      <p bf-s="test_s7" tabindex="1">d</p>
      <p bf-s="test_s8" tabindex="1">d</p>
      <p bf-s="test_s9" tabindex="1">d</p>
      <p bf-s="test_s10" bf="s0" tabindex="7">e</p>
      <p bf-s="test_s11" tabIndex="1">f</p>
      <p bf-s="test_s12" tabIndex="2">f</p>
      <p bf-s="test_s13" tabIndex="3">f</p>
    </div>
  `,
})
