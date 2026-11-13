import { createFixture } from '../src/types'

/**
 * A child component prop whose value reads a key only a literal const's
 * prototype has (`R.toString`, a function in JS). A template holds the
 * literal without a prototype, so a template adapter refuses the read
 * (BF101) instead of handing the child the missing-key answer or no value.
 * A component is rendered on the server whatever directive wraps it or its
 * prop, so this refusal has no `/* @client *\/` twin.
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-child-prop',
  description: 'a child prop computed from an inherited const key read reads the inherited function',
  source: `
'use client'
function InheritedKeyChild(props: { v: string }) {
  return <b>{props.v}</b>
}
export function ModuleConstInheritedKeyChildProp() {
  const R = { k: 'v' }
  return (
    <p>
      <InheritedKeyChild v={R.toString ? 'y' : 'n'} />
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test"><b bf-s="test_s0" bf="s1"><!--bf:s0-->y<!--/--></b></p>
  `,
})
