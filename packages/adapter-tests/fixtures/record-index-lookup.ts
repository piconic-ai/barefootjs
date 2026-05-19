import { createFixture } from '../src/types'

// Minimal repro of the variant-lookup pattern shadcn-style components
// like Button use:
//
//   const classes: Record<Variant, string> = { default: '...', destructive: '...' }
//   <button className={`base ${classes[variant]}`}>
//
// SSR adapters need to (1) hold the object literal as a hash-like
// value in template scope and (2) look it up by the current prop.
// The Mojo adapter regressed on (2) by emitting JS `({...})[key]`
// shape into the Perl template, which is a Perl syntax error — this
// fixture pins the contract so a future drift fails CI loudly.
export const fixture = createFixture({
  id: 'record-index-lookup',
  description: 'Object literal indexed by a prop, used in className composition',
  source: `
export function Variant({ variant }: { variant: 'a' | 'b' }) {
  const classes: Record<'a' | 'b', string> = {
    a: 'class-a',
    b: 'class-b',
  }
  return <div className={\`base \${classes[variant]}\`}>hi</div>
}
`,
  props: { variant: 'a' },
  expectedHtml: `
    <div bf-s="test" bf="s0" class="base class-a">hi</div>
  `,
})
