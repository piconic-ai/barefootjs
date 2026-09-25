import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Whitespace between static text and an adjacent conditional',
  given:
    'static JSX text directly adjacent to a conditional expression with no whitespace between them, before it (`x:{c ? \'on\' : \'off\'}`) or after it (`{c ? \'on\' : \'off\'}:y`), whether the condition reads a signal or a prop',
  expected: 'the text and the chosen branch abut with no whitespace between them (`x:off`, `off:y`)',
  actual: 'renders a space between the text and the chosen branch (`x: off`, `off :y`)',
  fixtures: ['text-then-conditional', 'text-then-conditional-static', 'conditional-then-text'],
})
