import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An array value in child position',
  given: 'an array prop interpolated as a child (`<p>{xs}</p>` with `xs: string[]`)',
  expected: 'the items render one after another, with no separator (`ab`)',
  actual: "renders the array stringified: its items joined with commas (`a,b`), or the template runtime's own notation for an array",
  fixtures: ['array-text-child'],
})
