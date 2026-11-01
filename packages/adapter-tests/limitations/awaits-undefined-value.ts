import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A `+` or template-literal operand whose nil may stand for `undefined` and Phase 1 cannot say',
  given:
    'an omitted prop typed both optional and nullable (`c?: string | null`) under `+` or in a template literal, an omitted optional number under a `+` whose other operand is untyped, or an untyped nil (an out-of-range index read) in a template literal',
  expected: 'the omitted value reads `undefined`: `"btn undefined"`, `"undefinedx"`, `"undefined"`',
  actual:
    'renders the either-nil string as the empty string and the other two as `null` (`"nullx"`, `"null"`), since the runtimes hold `undefined` and `null` as one nil; fixed per target once its runtime carries `undefined` (`spec/js-undefined-value.md`)',
  fixtures: ['awaits-undefined-plus-shapes'],
})
