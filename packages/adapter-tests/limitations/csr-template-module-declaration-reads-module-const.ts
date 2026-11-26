import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'CSR template reading a module const whose initializer runs a module declaration that reads another module const',
  given:
    "a module const whose initializer runs code that reads another module value const (`const V = 'v'`) in a form the client template does not splice: an immediately invoked arrow (`const B = (() => ({ k: V }))()`), a call of a module helper with parameters (`mk('a')`), or a call of a module `function` declaration; read in markup (`{B.k}`) and rendered client-side. The helper-call repros (`module-helper-param-reads-module-const`, `module-function-reads-module-const`) are refused server-side as module-scope helper calls, so they are listed under that entry",
  expected: "the value the initializer computes (`'v'`)",
  actual: 'renders empty: the client template has no form for the const once its initializer reads a module value const, so the read has nothing to resolve',
  fixtures: ['module-const-iife-reads-module-const'],
})
