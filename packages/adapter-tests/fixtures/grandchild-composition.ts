import { createFixture } from '../src/types'

/**
 * Three-level component composition (Parent → Child → Grandchild)
 * threading one prop down every level. Two-level composition is
 * pinned by `child-component`; the third level exercises transitive
 * child-shape registration and nested scope-id derivation.
 */
export const fixture = createFixture({
  id: 'grandchild-composition',
  description: 'Three-level composition threading a prop through each level',
  source: `
import { Middle } from './Middle'
export function GrandchildComposition() {
  return (
    <div>
      <Middle label="threaded" />
    </div>
  )
}
`,
  components: {
    './Middle': `
import { Leaf } from './Leaf'
export function Middle(props: { label: string }) {
  return <section><Leaf text={props.label} /></section>
}
`,
    './Leaf': `
export function Leaf(props: { text: string }) {
  return <span>{props.text}</span>
}
`,
  },
  expectedHtml: `
    <div bf-s="test"><section bf-s="test_s0"><span bf-s="test_s0_s0" bf="s1"><!--bf:s0-->threaded<!--/--></span></section></div>
  `,
})
