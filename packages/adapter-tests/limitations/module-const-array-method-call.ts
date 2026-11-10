import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A method call on a module array-literal const',
  given: "a module-scope array literal const with a method called on it in a template position (`const QS = ['a', 'b']`, `QS.join('-')`, `QS.includes('a')`)",
  expected: "the method's result (`'a-b'`, `true`)",
  actual:
    'renders the result empty or false, or fails the render, since the call reads the const as a template variable the backend does not bind',
  fixtures: ['module-const-array-method-call'],
})
