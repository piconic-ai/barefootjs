import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: "A missing optional field of a named object type reads as its type's zero value",
  given:
    "a read of an optional scalar field of a named object type off an object signal (`createSignal<User>({})`, `data-name={blank()?.name}`) bound to an attribute",
  expected: 'the read is `undefined`, so the attribute is omitted',
  actual:
    "renders the zero value (`data-name=\"\"`, `data-n=\"0\"`): the generated struct's optional field is a non-pointer `string` / `float64`, so a missing field is indistinguishable from a supplied `''` / `0`",
  fixtures: ['nullish-optional-member-missing-field-attr'],
})
