import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A literal object key that is not an identifier',
  given:
    "a member read with a literal string key that is not an identifier (`obj['a.b']`, `obj['*']`), in the component body, a loop row or a destructured row param (`({ 'a.b': ab }) =>`)",
  expected: "the value of the object's own key of that name (`obj['a.b']` is the own `\"a.b\"` key, not the nested `a.b`)",
  actual:
    "renders nothing for a key read as a field name derived from the key (`'a.b'`), and fails to render for a key that is not valid in a template field path (`'*'`)",
  fixtures: ['literal-index-own-key'],
})
