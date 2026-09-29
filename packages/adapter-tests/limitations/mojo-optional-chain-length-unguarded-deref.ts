import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Optional-chained `.length` deref runs before its `??` fallback',
  given:
    'an optional-chained `.length` read defaulted with `??`, used as a condition operand, over an absent array (`(props.items?.length ?? 0) > 0` with `items` undefined)',
  expected: 'the missing array falls back to `0`, so the comparison is false and the second branch renders',
  actual:
    'throws at render time instead: the template dereferences the array unconditionally before the `// 0` fallback ever runs ("Can\'t use an undefined value as an ARRAY reference")',
  fixtures: ['optional-chain-length-condition'],
})
