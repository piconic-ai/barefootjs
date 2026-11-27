import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A const initialized by a function literal call no template evaluates, read on the server',
  given:
    "a module or component const (or a module `let`) whose initializer calls a function literal in place, at any depth, other than a zero-param arrow with an expression body that repeats, writes nothing, holds no function and reads no `let` / `var` it sees (a read of `arguments`, `this` and the like as a key or a member name is not one): a block body (`(() => { return { k: 'a' } })()`, `(function () { return … })()`, also under `!`), an argument (`((x) => ({ k: x }))('v')`), a body that constructs or samples a value (`(() => ({ k: new Date(0).toISOString() }))()`), writes (`(() => delete o.k)()`, `(() => (p.n = 5))()`, `(() => p.n++)()`) or returns a function (`(() => () => 1)()`), or a call below the top of the initializer (`(() => (() => 1)() + 2)()`, `c ? (() => 'c')() : 'd'`, a template literal, an array literal, an array iteration callback or the default of its parameter, `[undefined].map((x = (() => 1)()) => x)`), read by the server render (`{B.k}`)",
  expected: 'the value the function returns (`a`)',
  diagnostic: 'BF101',
  fixtures: [
    'module-const-iife-block-body',
    'module-const-iife-with-argument',
    'module-const-iife-sampling-body',
    'component-const-iife-block-body',
    'component-const-iife-returns-function',
    'module-const-iife-write-body',
    'module-const-iife-nested-call',
  ],
})
