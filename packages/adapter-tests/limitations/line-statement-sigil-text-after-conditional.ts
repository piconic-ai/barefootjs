import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Text starting with a colon or percent sign right after a ternary',
  given:
    "static JSX text whose first non-space character is `:` or `%`, directly following a ternary conditional whose branches both render (`{c ? 'on' : 'off'} :y`, `{c ? 'on' : 'off'} %y`)",
  expected: 'the text renders verbatim after the chosen branch (`off :y`)',
  actual: 'throws a template parse error because the engine reads the text as a statement line, or drops the text when that line happens to parse',
  fixtures: ['conditional-then-colon-text', 'conditional-then-percent-text'],
})
