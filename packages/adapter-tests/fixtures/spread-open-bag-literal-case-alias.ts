import { createFixture } from '../src/types'

/**
 * A literal written before an open spread whose bag may carry the same
 * attribute spelled in another letter case: `tabIndex="1"` (which the IR
 * writes as `tabindex`) or `tabindex="1"` before a bag holding `tabIndex`.
 * The reference writes a bag key with the bag's spelling, so the two are
 * two keys of the props object, but one attribute to a browser, which keeps
 * the first. JSX keeps the last write: the element renders the bag's value
 * once. A key the bag lacks (`autoComplete`) keeps the literal.
 *
 * The bags are an index-signature rest (a number and a string value), the
 * props object whose type declares the key, a signal getter, and a loop
 * row's member (one row carries the key, one lacks it), also through a row
 * parameter named `Object`, which a read of the bag must not call.
 * `RestThenBag` puts the signal bag after a closed rest declaring
 * `tabindex`, which took the literal as its fallback (`rest.tabindex ??
 * "1"`): the bag's `tabIndex` replaces the fallback when the caller omits
 * `tabindex`, and the caller's value when it passes one. `BothThenBag`
 * spreads a closed rest declaring both spellings before the bag, which
 * replaces whichever the caller passes.
 */
export const fixture = createFixture({
  id: 'spread-open-bag-literal-case-alias',
  description: 'A literal tabIndex / tabindex before an open bag carrying tabIndex renders the bag value once',
  source: `
import { PropsObject } from './props-object'
import { Getter } from './getter'
import { RestThenBag, BothThenBag } from './rest-then-bag'
type P = { rows?: { id: number; attrs: Record<string, unknown> }[]; [key: string]: unknown }
export function SpreadOpenBagLiteralCaseAlias({ rows = [], ...rest }: P) {
  return (
    <div>
      <p tabIndex="1" {...rest}>a</p>
      <p tabindex="1" {...rest}>b</p>
      <input maxLength="5" autoComplete="off" {...rest} />
      <PropsObject tabIndex={2} />
      <Getter />
      <RestThenBag />
      <RestThenBag tabindex={3} />
      <BothThenBag tabindex={3} />
      <BothThenBag />
      <ul>{rows.map(r => <li key={r.id} tabIndex="1" {...r.attrs}>{r.id}</li>)}</ul>
      <ol>{rows.map(Object => <li key={Object.id} tabindex="1" {...Object.attrs}>{Object.id}</li>)}</ol>
    </div>
  )
}
`,
  components: {
    './props-object.tsx': `
export function PropsObject(props: { tabIndex?: number }) {
  return <p tabIndex="1" {...props}>c</p>
}
`,
    './getter.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Getter() {
  const [bag] = createSignal<Record<string, unknown>>({ tabIndex: 4 })
  return <p tabindex="1" {...bag()}>d</p>
}
`,
    './rest-then-bag.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function RestThenBag({ ...rest }: { tabindex?: number }) {
  const [bag] = createSignal<Record<string, unknown>>({ tabIndex: 5 })
  return <p tabIndex="1" {...rest} {...bag()}>e</p>
}
export function BothThenBag({ ...rest }: { tabIndex?: number; tabindex?: number }) {
  const [bag] = createSignal<Record<string, unknown>>({ tabIndex: 5 })
  return <p {...rest} {...bag()}>f</p>
}
`,
  },
  props: { tabIndex: 2, maxLength: '3', rows: [{ id: 1, attrs: { tabIndex: 6 } }, { id: 2, attrs: {} }] },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" maxLength="3" tabIndex="2">a</p>
      <p bf="s1" maxLength="3" tabIndex="2">b</p>
      <input autocomplete="off" bf="s2" maxLength="3" tabIndex="2">
      <p bf-s="test_s3" bf="s0" tabIndex="2">c</p>
      <p bf-s="test_s4" bf="s0" tabIndex="4">d</p>
      <p bf-s="test_s5" bf="s0" tabIndex="5">e</p>
      <p bf-s="test_s6" bf="s0" tabIndex="5">e</p>
      <p bf-s="test_s7" bf="s0" tabIndex="5">f</p>
      <p bf-s="test_s8" bf="s0" tabIndex="5">f</p>
      <ul bf="s11">
        <li bf="s10" data-key="1" tabIndex="6"><!--bf:s9-->1<!--/--></li>
        <li bf="s10" data-key="2" tabindex="1"><!--bf:s9-->2<!--/--></li>
      </ul>
      <ol bf="s14">
        <li bf="s13" data-key="1" tabIndex="6"><!--bf:s12-->1<!--/--></li>
        <li bf="s13" data-key="2" tabindex="1"><!--bf:s12-->2<!--/--></li>
      </ol>
    </div>
  `,
})
