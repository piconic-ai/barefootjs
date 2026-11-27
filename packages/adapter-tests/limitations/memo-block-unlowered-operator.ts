import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An operator no template lowers in a multi-statement memo block',
  given:
    'a block-bodied memo with more than one statement that applies an operator no template lowers (`typeof`, `**`, `~`, a bitwise or shift operator, `in`, `instanceof`) before or in its `return` (`const t = typeof props.x; return t`, `if (!props.x) return \'none\'; return typeof props.x`), read on the server',
  expected: 'the read renders the computed value (`string` for `typeof` of a string prop)',
  actual: 'renders the slot empty',
  fixtures: ['memo-typeof-block-statements'],
})
