import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A `+` over two numbers whose sum passes 2^53',
  given:
    'a `+` whose operands Phase 1 proves are numbers, with integer values whose sum passes 2^53 (`2**53 + 1`), on a target that spells the host `+` for two proven numbers',
  expected: 'the sum rounds as an IEEE double, as JS adds: `2**53 + 1` is `9007199254740992`',
  actual: 'renders `9007199254740993`, the exact integer sum the host computes; an accepted gap, since Phase 1 cannot prove an operand stays inside the safe-integer range (`spec/js-primitive-semantics.md`, "Decisions" (5))',
  fixtures: ['plus-beyond-safe-integer'],
})
