import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A destructure default calling a method on a literal receiver',
  given: 'a parameter-destructured prop whose default calls a method on a literal (`{ parts = \'a-b\'.split(\'-\') }`), rendered with the prop omitted',
  expected: 'the omitted prop takes the call result (`parts.length` renders `2`)',
  actual: 'drops the default: the omitted prop reads as empty (`parts.length` renders `0`)',
  fixtures: [
    'destructure-default-param-method-call',
  ],
})
