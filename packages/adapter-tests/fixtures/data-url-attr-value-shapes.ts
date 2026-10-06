import { createFixture } from '../src/types'

/**
 * Sibling of `data-url-attr-dynamic-value`: every `data-` name the Go
 * template engine would classify as a URL / CSS / srcset attribute
 * (`data-src`, `data-uri`, `data-url`, a composite `data-image-url`,
 * `data-href`, `data-style`, `data-srcset`) renders its value as plain
 * attribute text whatever the value shape — a prop read, a ternary, a
 * template literal, an empty string, and `"` / `&` / spaces / a scheme in the
 * value. `data-state` is the control; a real `href` keeps URL semantics, but
 * with a plain path value it renders the same everywhere.
 */
export const fixture = createFixture({
  id: 'data-url-attr-value-shapes',
  description: 'Prop, ternary, template-literal and empty values on URL-classified data-* attributes render as plain attribute text',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function DataUrlAttrValueShapes(props: { label: string; path: string }) {
  const [on] = createSignal(true)
  const [empty] = createSignal('')
  return (
    <a
      href={props.path}
      data-src={props.label}
      data-uri={on() ? 'javascript:x' : 'no'}
      data-url={\`u \${props.label}\`}
      data-image-url={empty()}
      data-href={props.path}
      data-style={props.label}
      data-srcset={on() ? 'a b 1x' : 'c'}
      data-state={props.label}
    >
      Content
    </a>
  )
}
`,
  props: { label: 'a "b" & c', path: '/p/q' },
  expectedHtml: `
    <a bf-s="test" bf="s0" data-href="/p/q" data-image-url="" data-src="a &quot;b&quot; &amp; c" data-srcset="a b 1x" data-state="a &quot;b&quot; &amp; c" data-style="a &quot;b&quot; &amp; c" data-uri="javascript:x" data-url="u a &quot;b&quot; &amp; c" href="/p/q">Content</a>
  `,
})
