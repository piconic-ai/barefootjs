import { createFixture } from '../src/types'

/**
 * Sibling of `data-on-attr-dynamic-value`: every value shape a `data-on…`
 * attribute can carry renders as plain attribute text — a prop read, a
 * ternary, a template literal, a ternary whose falsy branch is `undefined`
 * (omitted when false), and an absent optional prop (omitted). `"` and `&` in
 * the value are HTML-escaped exactly once.
 */
export const fixture = createFixture({
  id: 'data-on-attr-value-shapes',
  description: 'Prop, ternary, template-literal and omittable values on data-on* attributes render as plain attribute text',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function DataOnAttrValueShapes(props: { label: string; extra?: string }) {
  const [on] = createSignal(true)
  return (
    <div
      data-onset={props.label}
      data-on={on() ? 'yes' : 'no'}
      data-onload={\`v-\${props.label}\`}
      data-ontoggle={on() ? props.label : undefined}
      data-onclear={props.extra}
      data-state={props.label}
    >
      Content
    </div>
  )
}
`,
  props: { label: 'a"b&c' },
  expectedHtml: `
    <div bf-s="test" bf="s0" data-on="yes" data-onload="v-a&quot;b&amp;c" data-onset="a&quot;b&amp;c" data-ontoggle="a&quot;b&amp;c" data-state="a&quot;b&amp;c">Content</div>
  `,
})
