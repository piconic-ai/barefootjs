import { createFixture } from '../src/types'

/**
 * `.map()` over an INLINE array literal (`{['a','b','c'].map(...)}`)
 * — no signal, no prop, no const binding. The loop array is an
 * expression with no name, so any lowering that resolves the loop
 * source by identifier lookup has nothing to look up.
 */
export const fixture = createFixture({
  id: 'inline-array-map',
  description: '.map() directly over an inline array literal',
  source: `
export function InlineArrayMap() {
  return (
    <ul>
      {['alpha', 'beta', 'gamma'].map(name => (
        <li key={name}>{name}</li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="alpha"><!--bf:s0-->alpha<!--/--></li>
      <li data-key="beta"><!--bf:s0-->beta<!--/--></li>
      <li data-key="gamma"><!--bf:s0-->gamma<!--/--></li>
    </ul>
  `,
})
