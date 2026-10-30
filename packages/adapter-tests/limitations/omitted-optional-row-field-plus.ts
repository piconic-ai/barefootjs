import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A `+` over an optional string row field',
  given:
    'a `+` in a `.map()` row whose operand is a row field declared optional and string (`id?: string`), read as `row.id` or destructured, over rows that omit the field and rows that have it',
  expected: 'an omitted field reads `undefined` (`o.id + \'!\'` is `undefined!`, `o.id + 1` is `NaN`) and a present one concatenates (`o1`)',
  actual: 'renders an omitted field as empty or `0` or throws at render time, and adds a present one as a number',
  fixtures: ['omitted-optional-row-field-plus'],
})
