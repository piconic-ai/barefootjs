import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A destructured prop typed as an object type with an index signature, spread onto an element',
  given:
    'a destructured prop typed as an object type whose properties are not its whole key set (`bag: { title: string; [key: string]: string }`) spread onto an intrinsic element (`{...bag}`)',
  expected: 'the element renders every entry the caller passes, an undeclared key included',
  diagnostic: 'BF101',
  fixtures: ['spread-open-object-prop-bag'],
})
