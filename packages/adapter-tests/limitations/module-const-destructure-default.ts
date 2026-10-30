import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A destructure default that reads a module-scope const',
  given:
    "a props destructure default that reads a module-scope const (`const DEFAULT_LABEL = 'm'`, `{ label = DEFAULT_LABEL }`; `const START = 2`, `{ start = START }`), with the prop omitted: read as text, an attribute, a template literal, a concatenation or a loop row, or seeding a signal (`createSignal(start)`) rendered as text",
  expected: "the omitted prop, and a signal seeded from it, take the const's value",
  actual: 'renders the signal seeded from the omitted prop as an empty value; some backends also render the prop itself empty in every read position',
  fixtures: ['module-const-destructure-default', 'module-const-default-hydrate'],
})
