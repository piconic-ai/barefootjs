import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A canonical index string indexing a list in the template',
  given: "a list index read in the template with a string key that is a canonical index name (`row[k]` where `k` is `'1'`)",
  expected: "the element at that index (JS reads the key `'1'` as index 1, as it reads the number `1`)",
  actual: "renders nothing: the template engine's `[]` looks a string key up as a missing mapping key on a list",
  fixtures: ['index-key-canonical-form'],
})
