import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: "An attribute bound to a signal seeded from an object prop's omitted or null optional field",
  given:
    "a signal seeded from an optional field of an object prop (`type Init = { label?: string }`, `createSignal(initial.label)`) bound to an attribute (`title={label()}`), with the object omitting the field or holding `null` for it",
  expected: 'the attribute is omitted, as for any attribute whose value is `null` or `undefined`',
  actual: 'renders the attribute with an empty value (`title=""`)',
  fixtures: ['optional-member-signal-seed-js-value'],
})
