import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A props member typed as an inline intersection',
  given:
    'a prop or props-interface member whose type is an inline intersection (`data: A & B`), read through its members (`props.data.label`, `props.data.at.getUTCFullYear()`)',
  expected: 'the member values (`y:2024`)',
  actual:
    'renders `:0`, since the member is generated as an `interface{}` field holding the source-keyed map, so a capitalised member read finds nothing and the Date accessor reads a zero time',
  fixtures: [
    'date-intersection-member',
    'date-intersection-member-interface',
    'date-intersection-member-destructured',
    'date-intersection-member-literal-arm',
  ],
})
