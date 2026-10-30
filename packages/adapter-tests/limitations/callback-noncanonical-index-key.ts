import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A non-canonical numeric key indexing a list inside a callback',
  given:
    "a list index read inside a callback the runtime evaluator runs (`rows.map(r => r[k])`) with a string key that spells a number but is not the canonical index name (`'01'`, `'-0'`, `'1e0'`)",
  expected:
    "nothing (`undefined`): JS reads a list element only through a canonical index name (`1` or `'1'`), the same answer as the read outside the callback",
  actual:
    "the element at the key's numeric value (`'01'` and `'1e0'` read element 1, `'-0'` element 0): the evaluator converts the key with ToNumber before reading the list",
  fixtures: ['index-key-canonical-form'],
})
