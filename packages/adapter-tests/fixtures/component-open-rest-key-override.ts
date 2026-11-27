import { createFixture } from '../src/types'

/**
 * `component-closed-rest-key-override` with an index-signature rest: a
 * component prop written beside an open rest spread that may carry the
 * same prop (`htmlFor`, `crossOrigin`). The last write of a key wins, once;
 * a literal before the spread stays when the caller omits the key. A prop
 * spelling a rest key in another letter case (`tabindex` beside the rest's
 * `tabIndex`) is another key, and `Named` reads both.
 */
export const fixture = createFixture({
  id: 'component-open-rest-key-override',
  description: 'A component prop beside an open rest carrying the same htmlFor / crossOrigin key renders the last write once',
  source: `
import { Parent } from './parent'
export function ComponentOpenRestKeyOverride() {
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
    './parent.tsx': `
import { Named } from './named'
export function Parent({ ...rest }: { [key: string]: unknown }) {
  return (
    <p>
      <Named {...rest} htmlFor="after" crossOrigin="anonymous" tabindex="1" />
      <Named htmlFor="before" crossOrigin="anonymous" tabindex="1" {...rest} />
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
      </p>
      <p bf-s="test_s1">
        <label bf-s="test_s1_s0" bf="s0" crossorigin="anonymous" data-lower="1" for="after">n</label>
        <label bf-s="test_s1_s1" bf="s0" crossorigin="anonymous" data-lower="1" for="before">n</label>
      </p>
    </div>
  `,
})
