import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A component binding named like a module binding, in the client script',
  given: 'a component-scope const or function named like a module-scope one that the component, or a module function it calls, also reads',
  expected: 'each read resolves lexically: the component binding inside the component, the module binding inside the module function',
  actual: 'emits both declarations into one scope of the client script, which then fails to load (a redeclared const) or calls the module function for the component one',
  fixtures: ['local-function-hides-module-function'],
})
