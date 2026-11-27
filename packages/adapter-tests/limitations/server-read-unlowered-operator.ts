import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'An operator no template lowers in a value read on the server',
  given:
    'an operator outside comparison, arithmetic, `!` and unary `-` / `+` (`typeof x`, `a ** b`, `~a`, a bitwise or shift operator, `in`, `instanceof`) in a signal seed (`createSignal(typeof props.x)`), a memo body (`createMemo(() => typeof props.x)`, directly, through another memo, in a callback it runs, as the single `return` of a block body, or in a member of a returned object literal), a component const initializer (a const object literal only through a member a template read reaches, or whole when a signal seed or memo body reads it), or a child prop (`<Kid v={typeof props.x} />`) the server render reads',
  expected: 'the read renders the computed value (`string` for `typeof` of a string prop)',
  diagnostic: 'BF101',
  fixtures: [
    'memo-typeof-prop',
    'signal-seed-typeof-prop',
    'memo-typeof-through-memo',
    'memo-typeof-filter-callback',
    'memo-typeof-block-return',
    'memo-typeof-object-member',
    'memo-object-body-reads-typeof-const',
    'memo-block-return-reads-typeof-const',
    'signal-seed-reads-typeof-const',
    'memo-exponent-operator',
    'const-typeof-prop',
    'memo-typeof-child-prop',
    'child-prop-typeof',
  ],
})
