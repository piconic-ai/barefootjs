import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An explicitly empty value for a prop with a destructure default',
  given:
    "a destructured prop with a default (`{ tag = 'z' }`, `{ n = 2 }`) passed its type's empty value explicitly (`tag: ''`, `n: 0`)",
  expected: "the explicit value wins: the default applies only to an absent prop, so the binding is `''` / `0`",
  actual:
    "renders the default (`'z'` / `2`), since the input struct field cannot tell an explicit empty string or zero from an absent prop",
  fixtures: [
    'destructure-default-body-chain-order',
    'destructure-default-body-renamed',
    'destructure-default-chain',
    'destructure-default-param-chain-order',
    'destructure-default-param-renamed',
    'number-prop-fraction-default',
    'signal-computed-seed-sibling-fallbacks-destructured',
    'signal-seed-dependent-default-nullish-literal',
    'signal-seed-dependent-default-nullish-literal-body',
  ],
})
