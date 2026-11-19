import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A Date member inherited or intersected on a nested named type',
  given:
    'a Date member reached through a named object type that gets it from `extends` or an intersection alias (`type Data = { at: Date } & { at: Date | null }`, `props.data.at.getUTCFullYear()`)',
  expected: 'the Date accessor result (`2024`)',
  actual:
    "renders `0`, since the generated Go struct for the nested named type is built from the type's own members only and the inherited `at` is not a `time.Time` field",
  fixtures: ['date-intersection-nested-narrowing'],
})
