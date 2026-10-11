import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: '.length on a loop item\'s field inside a .filter() predicate never matches on go-template',
  given: 'a `.filter()` predicate that reads `.length` on a loop item\'s string or array field (`items().filter(i => i.name.length > 2)`)',
  expected: 'the predicate compares the field\'s length and keeps the matching rows',
  actual: 'drops every row: the inline lowering reads a `Length` field off a Go string, and the filter evaluator does not resolve `.length` on the item\'s field',
  fixtures: ['object-signal-field-length'],
})
