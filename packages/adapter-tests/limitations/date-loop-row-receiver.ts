import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A catalogued Date method on a loop row',
  given:
    'a catalogued `Date` accessor called on a value read through a `.map()` row (`props.rows.map(r => r.at.getUTCFullYear())`, with `rows: { at: Date }[]`)',
  expected: 'each row renders the accessor result (`2024`, `2025`)',
  diagnostic: 'BF021',
  fixtures: ['date-loop-row-member'],
})
