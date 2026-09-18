import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Child-component loop over a nested array on a destructured object prop renders empty on Go',
  given: 'a `.map()` over a nested array property of a destructured OBJECT-shaped prop (`data.entries.map(entry => <Tag .../>)`, where `data` — not `entries` — is the prop), body a child component',
  expected: 'the child component renders once per array entry, same as Hono/CSR',
  actual: 'renders the parent element with no child rows at all',
  fixtures: ['nested-prop-object-array-with-component'],
})
