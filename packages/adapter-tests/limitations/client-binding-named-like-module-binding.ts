import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A component binding named like a module binding, in the client script',
  given: 'a component-scope const or function named like a module-scope one that the component, a parameter default of it, or a module function it calls, also reads',
  expected: 'each read resolves lexically: the component binding inside the component, the module binding inside the module function and in a parameter default',
  actual: 'emits both declarations into one scope of the client script, which then fails to load (a redeclared const) or calls the module function for the component one; a parameter default reads the component const in the client template, and an undeclared name where the component const is unread',
  fixtures: ['local-function-hides-module-function', 'destructure-default-param-body-const-same-name'],
})
