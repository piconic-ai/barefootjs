import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A props member typed as a nullable anonymous object type',
  given:
    'a prop whose type is a union of an inline object type (or an inline intersection) and `null` (`data: { label: string } | null`), read through its members (`props.data.label`)',
  expected: 'the member value (`y`)',
  actual:
    'renders an empty string, since the member is generated as an `interface{}` field holding the source-keyed map, so a capitalised member read finds nothing',
  fixtures: ['inline-object-prop-nullable-member'],
})
