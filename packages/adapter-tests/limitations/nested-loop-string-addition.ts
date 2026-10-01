import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'String addition across nested loop bindings',
  given: 'nested `.map()` rows over string-array props, with `outer + inner` in an attribute or a conditional comparison',
  expected: 'the two string row values concatenate, so the attribute and conditional compare the complete combined value',
  actual: 'renders an incomplete or numeric combined value, or throws a runtime operand-type error, with no compile-time diagnostic',
  fixtures: ['nested-loop-string-addition'],
})
