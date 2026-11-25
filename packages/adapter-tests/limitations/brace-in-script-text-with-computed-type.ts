import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A tag-opening brace in the text of a `<script>` whose type is computed at render time',
  given:
    'a `{` that would open a template tag, in the literal text of a `<script>` whose `type` ends in a value computed at render time (`<script type={kind}>if (a) &#123;&#123; b() &#125;&#125;</script>`)',
  expected: 'the text as written inside the element',
  diagnostic: ['BF101'],
  fixtures: ['raw-text-brace-delimiter-script-type-expression'],
})
