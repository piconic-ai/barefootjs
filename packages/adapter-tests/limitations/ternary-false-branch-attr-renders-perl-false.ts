import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A taken `false` ternary branch in a non-boolean attribute renders as Perl false',
  given:
    "a non-boolean attribute bound to a ternary whose taken branch is the literal `false` and whose other branch is not boolean (`data-choice={yes() ? false : s()}`)",
  expected: 'renders `data-choice="false"`, as JS `String(false)`',
  actual:
    'renders `data-choice="0"`: the `false` literal lowers to Perl `0` inside the ternary, and the attribute routes through `bool_str` only when the whole value is boolean-shaped',
  fixtures: ['nullish-ternary-false-branch-attr'],
})
