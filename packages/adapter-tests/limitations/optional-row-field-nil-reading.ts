import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'An optional row field read by its nil under a coercion',
  given:
    'an optional scalar row field (`id?: string`) under a `+`, a template literal, an arithmetic or a relational operator, on a target whose row struct holds the field as a concrete value',
  expected: 'a supplied empty or zero value is kept (`\'\' + \'!\'` is `!`) and an omitted field reads `undefined` (`undefined!`)',
  diagnostic: 'BF101',
  fixtures: ['omitted-optional-row-field-plus', 'nil-reading-concrete-zero-row-field'],
})
