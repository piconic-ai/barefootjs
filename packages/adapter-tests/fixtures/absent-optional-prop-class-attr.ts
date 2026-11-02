import { createFixture } from '../src/types'

/**
 * An absent optional value bound to `class` / `className` / `style` omits
 * the attribute, as it does on any other attribute (#3859). Covers a
 * props-object `className={props.tone}`, `class={props.hue}`, a string
 * `style={props.css}`, a static child call whose destructured `class={tone}`
 * prop is omitted, and an object signal's missing optional field read
 * through `?.`. A present value, including `''`, still renders. A loop-row child fed an absent row
 * field is `loop-row-child-absent-optional-field-attr`.
 */
export const fixture = createFixture({
  id: 'absent-optional-prop-class-attr',
  description: 'An absent optional value bound to class / className / style omits the attribute (#3859)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Item } from './item'
type Look = { tone?: string; css?: string }
export function AbsentOptionalPropClassAttr(props: { tone?: string; hue?: string; css?: string }) {
  const [blank] = createSignal<Look>({})
  const [given] = createSignal<Look>({ tone: 'on', css: 'color:red' })
  return (
    <div className={props.tone}>
      <span class={props.hue}>h</span>
      <em style={props.css}>c</em>
      <Item label="static" />
      <Item label="toned" tone="on" />
      <p class={blank()?.tone} style={blank()?.css}>blank</p>
      <p class={given()?.tone} style={given()?.css}>given</p>
    </div>
  )
}
`,
  components: {
    './item.tsx': `
export function Item({ label, tone }: { label: string; tone?: string }) {
  return <li class={tone}>{label}</li>
}
`,
  },
  props: { hue: '' },
  expectedHtml: `
    <div bf-s="test" bf="s6">
      <span bf="s0" class="">h</span>
      <em bf="s1">c</em>
      <li bf-s="test_s2" bf="s1"><!--bf:s0-->static<!--/--></li>
      <li bf-s="test_s3" bf="s1" class="on"><!--bf:s0-->toned<!--/--></li>
      <p bf="s4">blank</p>
      <p bf="s5" class="on" style="color:red">given</p>
    </div>
  `,
  dataPoints: [
    { name: 'all-present', props: { tone: 't', hue: 'h', css: 'color:red' } },
    { name: 'all-absent', props: {} },
  ],
})
