import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An attribute bound to a method call that returns undefined',
  given:
    "an attribute whose value is an array or string method call that returns `undefined` for the current value (`data-last={props.word.at(-1)}` with `word: ''`)",
  expected: 'the attribute is omitted, as for any `undefined` attribute value',
  actual: 'renders the attribute with an empty value (`data-last=""`)',
  fixtures: ['string-index-methods'],
})
