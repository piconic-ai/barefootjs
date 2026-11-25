import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A tag-opening brace in the text of a `<script>` whose type holds a character outside ASCII',
  given:
    'a `{` that would open a template tag, in the literal text of a `<script>` whose literal `type` holds a character outside ASCII (a BOM or U+0085 after `module`), the text holding `{{`',
  expected: 'the text as written inside the element',
  diagnostic: ['BF101'],
  fixtures: ['raw-text-brace-delimiter-script-type-non-ascii'],
})
