import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Loop row key reading outer state on constructor-built component rows',
  given: 'a component loop row over an array prop keyed by an expression that reads outer state as well as the row (`key={props.prefix + n}`)',
  expected: 'every row carries the key value as `data-key`',
  diagnostic: 'BF101',
  fixtures: ['loop-row-child-outer-state-key'],
})
