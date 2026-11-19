import { createFixture } from '../src/types'

/**
 * A key an open spread carries and an explicit attribute also writes renders
 * once, with the last write, as JS (and so Hono) applies them in order. The
 * template adapters render the key twice for the shapes here, which
 * `literal-attr-before-spread` does not cover: an attribute with an
 * expression or template value before the spread, an attribute after the
 * spread (which overrides the bag), two spreads that share a key, a bag key
 * that holds an explicit `null` (the spread still wins, and renders nothing),
 * and a rest bag spelled `props`, which a template adapter reads as the props
 * object.
 */
export const fixture = createFixture({
  id: 'attr-spread-key-overlap',
  description: 'a key written by an open spread and by an expression, template or later attribute renders once, with the last write',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Named } from './named'
type P = { label?: string; [key: string]: unknown }
export function AttrSpreadKeyOverlap({ label, ...rest }: P) {
  const [extra] = createSignal<Record<string, string>>({ title: 'from-extra' })
  return (
    <div>
      <p id="a" title={label} {...rest}>1</p>
      <p id="b" title={\`t-\${label}\`} {...rest}>2</p>
      <p id="c" {...rest} title="after">3</p>
      <p id="d" {...rest} {...extra()}>4</p>
      <p id="e" lang="en" {...rest}>5</p>
      <Named title="from-named" />
    </div>
  )
}
`,
  components: {
    './named.tsx': `
export function Named({ size, ...props }: { size?: string; [key: string]: unknown }) {
  return <p title="lit" {...props}>{size}</p>
}
`,
  },
  props: { label: 'L', title: 'from-spread', lang: null },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" id="a" title="from-spread">1</p>
      <p bf="s1" id="b" title="from-spread">2</p>
      <p bf="s2" id="c" title="after">3</p>
      <p bf="s3" id="d" title="from-extra">4</p>
      <p bf="s4" id="e" title="from-spread">5</p>
      <p bf-s="test_s5" bf="s1" title="from-named"><!--bf:s0--><!--/--></p>
    </div>
  `,
})
