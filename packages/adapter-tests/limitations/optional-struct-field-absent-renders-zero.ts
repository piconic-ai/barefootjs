import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: "A missing optional field of a typed object signal reads as its type's zero value",
  given:
    "an attribute bound to an optional field of an object signal typed with a named object type (`createSignal<User>({})` with `type User = { name?: string }`, `data-name={blank()?.name}`)",
  expected: 'the read is `undefined`, so the attribute is omitted',
  actual:
    "renders `data-name=\"\"`: the signal's `User` struct has a non-pointer `Name string` field, so the missing field reads as the zero value `\"\"` instead of nil",
  fixtures: ['nullish-optional-member-missing-field-attr'],
})
