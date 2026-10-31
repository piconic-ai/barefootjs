import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A literal object key that is not an identifier, in a loop row',
  given:
    "a loop over rows whose object keys are not identifiers (`createSignal([{ 'a.b': 1, '*': 3 }])`), read by a literal key (`row['a.b']`) or through a destructured row param (`({ 'a.b': ab, '*': star }) =>`)",
  expected: "the value of each row's own key of that name (`row['a.b']` is the own `\"a.b\"` key, not the nested `a.b`)",
  actual:
    'renders no rows: the rows are not baked into the server-side state, and a destructured param reads a field name derived from the key (`.AB` for `\'a.b\'`)',
  fixtures: ['literal-index-own-key'],
})
