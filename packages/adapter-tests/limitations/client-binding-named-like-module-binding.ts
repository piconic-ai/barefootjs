import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A parameter default reading a module binding a body const hides, in the client script',
  given: 'a destructured parameter whose default reads a module-scope const, in a component whose body declares a const of the same name',
  expected: 'the default reads the module binding: a parameter list is evaluated before the body, so the body const is not in scope there',
  actual: 'emits the body const inlined into the default in the client template, and the mount reads the name where the client script declares no binding for it',
  fixtures: ['destructure-default-param-body-const-same-name'],
})
