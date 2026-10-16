import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A method call no template lowers',
  given: 'a template expression calling, with arguments, a method outside the array-method catalogue (`s().localeCompare(\'m\')`) outside any higher-order callback',
  expected: 'the method runs and its result renders in the server HTML',
  diagnostic: 'BF101',
  fixtures: ['unlowered-method-call'],
})
