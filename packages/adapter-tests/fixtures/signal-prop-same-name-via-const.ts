import { createFixture } from '../src/types'

// #2685 review: `signal-prop-same-name` pins the DIRECT self-derivation
// collision (`createSignal(props.label ?? 'Default')`); this fixture pins
// the SAME collision one hop of pure indirection removed — a component-scope
// `const` sitting between the prop read and the signal initializer:
//
//   const mid = props.label
//   const [label, setLabel] = createSignal(mid ?? 'Default')
//
// `ssr-defaults.ts`'s `referencesOwnProp` (built on `collectPropRefs`) only
// saw a DIRECT `props.<name>` access in the initializer expression, so this
// shape defeated the #2669 detection: the manifest entry lost `propName`
// (falling back to the plain evaluated signal value, `'Default'`), and the
// emitted template had no in-template recompute at all — so a caller-passed
// `label` NEVER won, on every template-stash backend. `expectedHtml` is the
// caller-supplied value (`Hello`); it must NOT silently fall back to
// `'Default'` (the pre-fix behavior on every template-stash adapter).
export const fixture = createFixture({
  id: 'signal-prop-same-name-via-const',
  description: 'Signal initialized from a same-named prop through one component-scope const hop',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalPropSameNameViaConst(props: { label?: string }) {
  const mid = props.label
  const [label, setLabel] = createSignal(mid ?? 'Default')
  return <span>{label()}</span>
}
`,
  props: { label: 'Hello' },
  expectedHtml: `
    <span bf-s="test" bf="s1"><!--bf:s0-->Hello<!--/--></span>
  `,
})
