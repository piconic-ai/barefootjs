import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Component-body destructure with no const form',
  given:
    'a component-body object destructure that is not of the props object and is not a `const` destructure of a const object with plain or literal-defaulted elements: a rest element (`const { a, ...more } = conf`), a non-literal default (`const { a = props.b } = conf`), or a source that is not a plain name (`const { a } = props.nested`, `const { a } = getConf()`)',
  expected: 'each destructured name holds the value JS binds to it',
  diagnostic: 'BF101',
  fixtures: ['body-destructure-rest-non-props-source', 'body-destructure-non-literal-default', 'body-destructure-non-identifier-source'],
})
