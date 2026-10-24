import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A string `.at(i)` landing on half of a surrogate pair',
  given:
    "`.at(i)` on a string where index `i` falls on one half of an astral character's surrogate pair (`'a😀b'.at(1)`), with the result compared or concatenated",
  expected:
    "a lone surrogate: the two halves compare different and concatenating them rebuilds the character (`${w.at(1)}${w.at(2)}` is `'😀'`)",
  actual:
    'renders U+FFFD for each half, since the runtime string cannot hold a lone surrogate, so the halves compare equal and the concatenation renders `��`',
  fixtures: ['string-at-lone-surrogate'],
})
