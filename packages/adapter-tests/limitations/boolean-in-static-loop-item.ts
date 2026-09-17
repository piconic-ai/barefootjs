import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Boolean field in a static loop item',
  given: 'a static array `.map()` whose item objects carry a boolean field, read by a conditional or a boolean attribute',
  expected: 'each row renders in the server HTML with the boolean applied per item',
  diagnostic: 'BF101',
  fixtures: ['static-loop-item-boolean-attr', 'static-loop-item-conditional'],
})
