import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'An array literal with a spread element read in a template',
  given:
    'a component-scope const holding an array literal with a spread element (`const local = [...b, \'z\']`), read in a server-rendered position (`local.length`)',
  expected: 'the read computes over the spread array (`2` for `b` of one element)',
  diagnostic: 'BF101',
  fixtures: ['destructure-default-spread-const-length'],
})
