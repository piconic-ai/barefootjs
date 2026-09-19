import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Authored call to formatDate',
  given: "a template-position call to `formatDate` imported by name from `@barefootjs/client` (or its `/runtime` subpath), e.g. `{formatDate(date, pattern)}`",
  expected: 'a compile-time refusal pointing at `date.toLocaleDateString(locale, { timeZone, ... })` with literal options, or `/* @client */` to defer the read',
  diagnostic: 'BF056',
  fixtures: ['format-date'],
})
