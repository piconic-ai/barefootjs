import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An omitted optional number compared in a memo the runtime evaluates',
  given:
    'a memo body comparing an optional number prop (`maybe?: number`) with `<` / `<=` / `>` / `>=`, rendered with the prop omitted, where the adapter computes the memo with its runtime evaluator',
  expected: 'the omitted prop reads `undefined`, which converts to `NaN`, so `maybe < n` and `maybe >= n` are both false',
  actual: 'the omitted prop reads as `null` (`0`), so `maybe < 1` is true',
  fixtures: ['relational-omitted-number-memo'],
})
