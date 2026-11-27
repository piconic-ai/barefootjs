import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A boolean spread bag value for a key outside the boolean attribute set',
  given:
    'an open spread bag (a destructured record prop included) or a closed rest whose key is not in the reference\'s boolean attribute set (`readOnly`, `data-x`, `title`) and holds `true` or `false`',
  expected: 'the key renders with the value\'s text (`readOnly="true"`, `data-x="true"`, `data-y="false"`); a key in the boolean attribute set (`disabled`) renders bare for `true` and is dropped for `false`',
  actual: 'Renders `true` as a bare attribute and drops `false` (`read-only`, `data-x`), or spells `false` as `0`',
  fixtures: ['spread-open-bag-boolean-values', 'spread-closed-rest-boolean-values', 'spread-record-prop-bag-boolean-value'],
})
