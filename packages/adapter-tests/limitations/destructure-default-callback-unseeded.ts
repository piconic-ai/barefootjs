import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A destructure default that calls a callback and reads no earlier prop',
  given:
    "a props destructure default that passes a callback to a call and reads no earlier binding of the pattern (`{ b = ['y', ''].filter((x) => x !== '') }`), in the parameter, body or renamed body destructure, with the prop omitted",
  expected: 'the omitted prop takes the default value',
  actual: 'renders the omitted prop as an empty value, without its default',
  fixtures: [
    'destructure-default-body-renamed-callback',
    'destructure-default-body-callback',
    'destructure-default-param-renamed-callback',
  ],
})
