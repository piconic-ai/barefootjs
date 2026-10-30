import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Operand typing of a props object not named props',
  given:
    'a component whose props object parameter is not named `props` (`function C(p)`) uses a prop member as a typed operand: `p.label + p.n` with a string and a number prop, or `p.on || \'none\'` yielding a boolean prop as an attribute value',
  expected: 'the string concatenation renders `L7` / `7L`, and the boolean renders `true`',
  actual:
    'renders the `+` as a numeric addition (`7`) or with the number formatted as `7.0`, or throws a type error; renders the boolean as `1`',
  fixtures: ['props-object-non-props-name-operand-typing'],
})
