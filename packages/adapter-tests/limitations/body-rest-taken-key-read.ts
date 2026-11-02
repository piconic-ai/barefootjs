import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Read of a taken key through a props-object body rest',
  given:
    'a member read, through the rest of a component-body destructure of the props object, of a key the same destructure takes (`const { label, ...rest } = props`, `rest.label`)',
  expected: 'the read is `undefined`, as the rest never holds the key',
  diagnostic: 'BF101',
  fixtures: ['body-rest-taken-key-read'],
})
