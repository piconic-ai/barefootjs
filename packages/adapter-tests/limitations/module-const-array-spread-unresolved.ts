import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Module array const spreading a value with no compile-time elements',
  given:
    "a module-scope array const with a spread of a value other than a literal array const or an inline array literal (`const ALL = [...new Set(['y', 'y']), 'z']`, a call, an import), read by a memo (`createMemo(() => ALL.length)`)",
  expected: 'the read computes over the spread array (`2`)',
  actual: 'renders empty, or `0`',
  fixtures: ['module-const-array-spread-unresolved'],
})
