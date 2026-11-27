import { createFixture } from '../src/types'

/**
 * A component prop written beside a closed rest spread (its props type
 * declares the keys) that carries the same prop: `<Named {...rest}
 * htmlFor="after" />` and `<Named htmlFor="before" {...rest} />`, for keys an
 * element spread renames (`htmlFor`, `crossOrigin`). Component props are a
 * props object, so the last write of a key wins, once; a literal before the
 * spread stays when the caller omits the key. `Named` reads each prop into
 * an attribute; `Field` spreads its own closed rest onto a `<label>`, which
 * renames the keys there (`for`, `crossorigin`).
 *
 * A prop that spells a rest key in another letter case (`tabindex` beside a
 * rest carrying `tabIndex`) is another key of the props object: neither
 * replaces the other, and `Named` reads both. A loop row forwarding a rest
 * beside an override is `component-rest-spread-explicit-override`;
 * `component-open-rest-key-override` is the index-signature twin.
 */
export const fixture = createFixture({
  id: 'component-closed-rest-key-override',
  description: 'A component prop beside a closed rest carrying the same htmlFor / crossOrigin key renders the last write once',
  source: `
import { Parent } from './parent'
export function ComponentClosedRestKeyOverride() {
  return (
    <div>
      <Parent htmlFor="given" crossOrigin="use-credentials" tabIndex={2} />
      <Parent />
    </div>
  )
}
`,
  components: {
    './named.tsx': `
export function Named(props: { htmlFor?: string; crossOrigin?: string; tabIndex?: number; tabindex?: string }) {
  return <label htmlFor={props.htmlFor} crossOrigin={props.crossOrigin} tabIndex={props.tabIndex} data-lower={props.tabindex}>n</label>
}
`,
    './field.tsx': `
export function Field({ ...attrs }: { htmlFor?: string; crossOrigin?: string }) {
  return <label {...attrs}>f</label>
}
`,
    './parent.tsx': `
import { Named } from './named'
import { Field } from './field'
export function Parent({ ...rest }: { htmlFor?: string; crossOrigin?: string; tabIndex?: number }) {
  return (
    <p>
      <Named {...rest} htmlFor="after" crossOrigin="anonymous" tabindex="1" />
      <Named htmlFor="before" crossOrigin="anonymous" tabindex="1" {...rest} />
      <Field {...rest} htmlFor="after" crossOrigin="anonymous" />
      <Field htmlFor="before" crossOrigin="anonymous" {...rest} />
    </p>
  )
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf-s="test_s0">
        <label bf-s="test_s0_s0" bf="s0" crossorigin="anonymous" data-lower="1" for="after" tabindex="2">n</label>
        <label bf-s="test_s0_s1" bf="s0" crossorigin="use-credentials" data-lower="1" for="given" tabindex="2">n</label>
        <label bf-s="test_s0_s2" crossorigin="anonymous" for="after">f</label>
        <label bf-s="test_s0_s3" crossorigin="use-credentials" for="given">f</label>
      </p>
      <p bf-s="test_s1">
        <label bf-s="test_s1_s0" bf="s0" crossorigin="anonymous" data-lower="1" for="after">n</label>
        <label bf-s="test_s1_s1" bf="s0" crossorigin="anonymous" data-lower="1" for="before">n</label>
        <label bf-s="test_s1_s2" crossorigin="anonymous" for="after">f</label>
        <label bf-s="test_s1_s3" crossorigin="anonymous" for="before">f</label>
      </p>
    </div>
  `,
})
