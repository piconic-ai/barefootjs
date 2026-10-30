import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: '`??` over an operand that can yield `false`',
  given:
    "`??` whose left operand is a logical expression or a ternary that can evaluate to `false` (`(n > 0 && 'y') ?? 'z'`, `(n ? 'y' : false) ?? 'z'`)",
  expected: '`false` is not nullish, so `??` yields it and it prints `false`',
  actual: 'renders the fallback: the lowering tests the left operand for truthiness',
  fixtures: ['logical-mixed-left-nullish', 'logical-mixed-left-nullish-destructured'],
})
