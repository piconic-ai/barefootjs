import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A destructured prop typed as a record, spread onto an element',
  given: 'a destructured prop typed as a record (`bag?: Record<string, string>`) spread onto an intrinsic element (`{...bag}`)',
  expected: 'the element renders the bag\'s entries, or nothing for an omitted bag',
  actual: 'Emits a program that does not build: the prop field and the spread field get different types',
  fixtures: ['spread-closed-rest-repeated-optional-bag'],
})
