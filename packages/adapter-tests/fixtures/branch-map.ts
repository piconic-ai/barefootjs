import { createFixture } from '../src/types'

/**
 * Array `.map(...)` returning JSX in a conditional branch.
 *
 * Exercises `transformConditionalBranch`'s `isMapCall` path (#783). The
 * truthy branch is a `.map()` call; the falsy branch is a plain JSX
 * element. Matrix cell: CallExpression(`.map`) × conditional branch.
 * Initial render takes the falsy branch — the truthy branch's loop
 * markers are emitted by the client-side effect.
 */
export const fixture = createFixture({
  id: 'branch-map',
  description: 'Conditional with .map in truthy branch, JSX in falsy branch',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function BranchMap() {
  const [active, setActive] = createSignal(false)
  const [items, setItems] = createSignal<string[]>(['a', 'b'])
  return <div>{active() ? items().map(n => <li key={n}>{n}</li>) : <span>Empty</span>}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2"><span bf-c="s0">Empty</span></div>
  `,
})
