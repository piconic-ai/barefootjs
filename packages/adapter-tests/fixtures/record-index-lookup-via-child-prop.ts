import { createFixture } from '../src/types'

// Companion to `record-index-lookup` for the case the scaffold's
// shadcn-style Button actually hits: the variant lookup lives inside
// a template literal that is passed to a CHILD component's prop
// (`<Slot className={`base ${classes[variant]}`}>`), rather than
// directly on an element attribute.
//
// The IR producer already lifts identifier-rewritten template literals
// for element attributes (`record-index-lookup` proves it), but the
// component-prop path (`IRProp` → `MojoAdapter.renderComponent`,
// `GoTemplateAdapter` template prop, Hono's child-prop forwarding) has
// historically dropped or mangled the parts structure. Pinning the
// expected HTML here keeps any future regression on the
// shadcn-Button-on-Mojo end-to-end path from going silent.
export const fixture = createFixture({
  id: 'record-index-lookup-via-child-prop',
  description: 'Object literal indexed by a prop, passed to a child component prop',
  source: `
import { Slot } from './slot'
export function V({ variant }: { variant: 'a' | 'b' }) {
  const classes: Record<'a' | 'b', string> = {
    a: 'class-a',
    b: 'class-b',
  }
  return <Slot className={\`base \${classes[variant]}\`}>hi</Slot>
}
`,
  components: {
    './slot.tsx': `
export function Slot({ className, children }: { className: string; children: any }) {
  return <span className={className}>{children}</span>
}
`,
  },
  props: { variant: 'a' },
  expectedHtml: `
    <span bf-s="test_s0" bf="s0" class="base class-a">hi</span>
  `,
})
