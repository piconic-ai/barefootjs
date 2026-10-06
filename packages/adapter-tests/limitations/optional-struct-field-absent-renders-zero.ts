import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: "A missing optional field of a named object type reads as its type's zero value",
  given:
    "a read of an optional scalar field of a named object type — off an object signal (`createSignal<User>({})`, `data-name={blank()?.name}`) or seeding a nullable signal off a required object prop (`createSignal<string | undefined>(initial.label)` with `initial` = `{}`) — bound to an attribute, or an absent optional string prop read through `?.length` in text",
  expected: 'the read is `undefined`, so the attribute is omitted (or the text renders empty)',
  actual:
    "renders the zero value (`data-name=\"\"`, `data-n=\"0\"`, or `0` for `noText?.length`): the generated struct's optional field is a non-pointer `string` / `float64`, so a missing field is indistinguishable from a supplied `''` / `0`",
  fixtures: ['nullish-optional-member-missing-field-attr', 'member-seeded-nullable-signal-attr', 'optional-chain-length-string-receiver'],
})
