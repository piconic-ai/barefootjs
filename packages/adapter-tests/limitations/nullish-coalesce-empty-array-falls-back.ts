import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: '`??` falls back over a present empty array',
  given:
    'a `??` whose left operand is an optional array prop that is present but empty (`(props.c ?? props.a)?.length` with `c` = `[]`)',
  expected: 'the empty array is not nullish, so `??` keeps it and `.length` reads `0`',
  actual:
    "renders the fallback's length (`2` for `a` = `[1, 2]`): the `??` lowers to html/template's truthiness-based `or`, and an empty slice is falsy; `bf_nullish` is used only for a nillable scalar prop",
  fixtures: ['optional-chain-length-composed-receiver'],
})
