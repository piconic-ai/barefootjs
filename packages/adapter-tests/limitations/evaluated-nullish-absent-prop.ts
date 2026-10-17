import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An absent optional prop under `??` inside an evaluated seed',
  given:
    "a signal or memo seeded by an expression the runtime evaluator computes, with an absent optional prop on the left of a `??` (`createSignal((props.label ?? 'a') + 'b')`, `createSignal((props.n ?? 1) * 2)`)",
  expected: "the absent prop reads as `undefined`, so `??` takes its right side (`'ab'`, `2`)",
  actual: "the evaluator receives the prop's Go zero value (`\"\"`, `0`), which `??` keeps (`'b'`, `0`)",
  fixtures: ['signal-computed-prop-seed-absent'],
})
