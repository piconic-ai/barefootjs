import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: '.length on an object\'s own length property reads 0 in an inline filter predicate',
  given: 'an inline `.filter()` predicate that reads an object row\'s own `length` property (`rows().filter(r => r.length > 2)`)',
  expected: 'the predicate compares the row\'s `length` property and keeps the matching rows',
  actual: 'drops the rows: the runtime length helper counts a string or an array and returns 0 for an object',
  fixtures: ['object-length-property-filter'],
})
