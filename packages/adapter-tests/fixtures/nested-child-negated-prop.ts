import { createFixture } from '../src/types'

/**
 * A unary-not expression (`!value()`) passed as a child component's prop
 * (#3174). The Go template adapter's static-child-instance constructor
 * baking (`emitStaticChildInstances` → `resolveDynamicPropValue`) silently
 * omitted the field for exactly this shape — a plain getter call or a
 * comparison against one already reached the child fine, but `!getter()`
 * matched none of that function's recognized shapes and fell through to
 * `null`, leaving the child's own zero value (`false`) in place of the real
 * negated value with no diagnostic. This is the minimal repro of
 * `SelectTrigger`'s (and `ComboboxTrigger`'s) `showPlaceholder={!value()}`.
 */
export const fixture = createFixture({
  id: 'nested-child-negated-prop',
  description: 'a unary-not expression passed as a child component prop reaches the child at SSR',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Trigger } from './trigger'

export function NestedChildNegatedProp(props: { v?: string }) {
  const [value] = createSignal('')
  return (
    <div>
      <Trigger showPlaceholder={!value()}>x</Trigger>
    </div>
  )
}
`,
  components: {
    './trigger': `
export function Trigger(props: { showPlaceholder?: boolean; children?: any }) {
  return <button data-placeholder={props.showPlaceholder ? '' : undefined}>{props.children}</button>
}
`,
  },
  expectedHtml: `
    <div bf-s="test"><button bf-s="test_s0" bf="s0" data-placeholder="">x</button></div>
  `,
})
