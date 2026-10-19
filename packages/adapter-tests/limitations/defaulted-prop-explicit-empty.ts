import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An explicitly empty value for a prop with a destructure default',
  given: "a destructured prop with a string default (`{ tag = 'z' }`) passed an explicit empty string (`tag: ''`)",
  expected: "the explicit value wins: the default applies only to an absent prop, so the binding is `''`",
  actual:
    "renders the default (`'z'`), since the input struct field cannot tell an explicit empty string from an absent prop",
  fixtures: [
    'destructure-default-body-chain-order',
    'destructure-default-body-renamed',
    'destructure-default-chain',
    'destructure-default-param-chain-order',
    'destructure-default-param-renamed',
    'signal-computed-seed-sibling-fallbacks-destructured',
  ],
})
