import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A const initialized by a function literal call no template evaluates, read on the server',
  given:
    "a module or component const (or a module `let`) whose initializer calls a function literal in place other than a zero-param arrow with an expression body that repeats: a block body (`(() => { return { k: 'a' } })()`, `(function () { return … })()`), an argument (`((x) => ({ k: x }))('v')`), or a body that constructs or samples a value (`(() => ({ k: new Date(0).toISOString() }))()`), read by the server render (`{B.k}`)",
  expected: 'the value the function returns (`a`)',
  diagnostic: 'BF101',
  fixtures: [
    'module-const-iife-block-body',
    'module-const-iife-with-argument',
    'module-const-iife-sampling-body',
    'component-const-iife-block-body',
  ],
})
