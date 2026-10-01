import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Const string arrays in conditional nested loops',
  given: 'nested `.map()` rows inside a reactive conditional branch, with an inner module-scope const string-array source and a const or signal outer source',
  expected: 'both levels of rows render in the server HTML',
  diagnostic: 'BF101',
  fixtures: ['conditional-nested-loop-static-reactivity', 'conditional-nested-loop-signal-reactivity'],
})
