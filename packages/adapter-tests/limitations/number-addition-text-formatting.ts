import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Large fractional addition in text',
  given: 'a large numeric prop plus a fractional literal rendered directly in text',
  expected: 'renders the JavaScript decimal spelling of the result',
  actual: 'renders the result in exponential notation instead of JavaScript decimal notation',
  fixtures: ['number-addition-text-formatting'],
})
