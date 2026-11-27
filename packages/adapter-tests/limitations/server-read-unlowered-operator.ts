import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'An operator no template lowers in a value read on the server',
  given:
    'an operator outside comparison, arithmetic, `!` and unary `-` / `+` (`typeof x`, `a ** b`, `~a`, a bitwise or shift operator, `in`, `instanceof`) in a signal seed (`createSignal(typeof props.x)`), a memo body (`createMemo(() => typeof props.x)`, directly, through another memo or in a callback it runs), a component const initializer, or a child prop (`<Kid v={typeof props.x} />`) the server render reads',
  expected: 'the read renders the computed value (`string` for `typeof` of a string prop)',
  diagnostic: 'BF101',
  fixtures: [
    'memo-typeof-prop',
    'signal-seed-typeof-prop',
    'memo-typeof-through-memo',
    'memo-typeof-filter-callback',
    'memo-exponent-operator',
    'const-typeof-prop',
    'memo-typeof-child-prop',
    'child-prop-typeof',
  ],
})
