import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A dynamic value on a `data-on…` attribute renders as a quoted script string',
  given:
    'an element attribute named `data-` followed by a name starting with `on` (`data-on`, `data-onset`) whose value is dynamic (`<div data-on={mode()}>`)',
  expected: 'the attribute carries the value as plain text (`data-on="x"`), like any other `data-*` attribute',
  actual:
    'renders the value as a script string literal, so the attribute text carries escaped double quotes around it (`"x"` instead of `x`, `""` for an empty value), because the template engine escapes a `data-on…` attribute as an event-handler attribute',
  fixtures: ['data-on-attr-dynamic-value'],
})
