import { createFixture } from '../src/types'

/**
 * A closed rest (its keys come from the props type, so the compiler expands
 * the spread into one attribute per key) whose keys are the React-style
 * names the reference renames when it renders a spread bag. A spread of a
 * local object const (`{...labelAttrs}`) expands the same way. The expanded
 * attributes keep the bag's key until an adapter writes them, so this pins
 * that every adapter renames them as the reference does (`htmlFor` -> `for`,
 * not only `className` -> `class`).
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-attr-names',
  description: 'Closed rest and local const object spread keys render with the spread key names of the reference',
  source: `
type P = {
  className?: string
  htmlFor?: string
  crossOrigin?: string
  httpEquiv?: string
  itemProp?: string
  fetchPriority?: string
  noModule?: string
  formAction?: string
}
export function SpreadClosedRestAttrNames({ ...rest }: P) {
  const labelAttrs = { htmlFor: 'g', className: 'h' }
  return (
    <div>
      <p {...rest}>x</p>
      <label {...labelAttrs}>y</label>
    </div>
  )
}
`,
  props: {
    className: 'a',
    htmlFor: 'f',
    crossOrigin: 'anonymous',
    httpEquiv: 'refresh',
    itemProp: 'name',
    fetchPriority: 'high',
    noModule: 'm',
    formAction: '/go',
  },
  expectedHtml: `
    <div bf-s="test">
      <p class="a" crossorigin="anonymous" fetchpriority="high" for="f" formaction="/go" http-equiv="refresh" itemprop="name" nomodule="m">x</p>
      <label class="h" for="g">y</label>
    </div>
  `,
})
