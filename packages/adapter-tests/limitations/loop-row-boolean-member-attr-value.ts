import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Boolean loop-row member as an attribute value',
  given: 'a loop row\'s boolean member bound to a non-boolean attribute (`data-off={r.off}`), read from a typed array prop',
  expected: 'the attribute renders `true` / `false`, and is omitted on a row that lacks the member',
  actual: 'renders `1` / `0` for a present member',
  fixtures: ['loop-row-boolean-member-attr'],
})
