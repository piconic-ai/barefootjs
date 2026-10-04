import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Division of two integers truncates the fractional part',
  given: 'a division whose operands are both integers, rendered as text (`{props.value / 4}` with `value` 1234567890)',
  expected: 'renders the JavaScript number quotient, fractional part included (`308641972.5`)',
  actual: 'renders the truncated integer quotient (`308641972`)',
  fixtures: ['number-division-text'],
})
