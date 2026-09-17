import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'by-design',
  title: 'Reactive primitive called through a namespace import',
  given: 'a reactive primitive invoked through a namespace import (`import * as bf`, `bf.createSignal(...)`) in a compile with no shared `ts.Program`',
  expected: 'the signal is declared and the component hydrates',
  diagnostic: 'BF013',
  reason:
    'Without a type checker the analyzer fast path matches only a bare identifier callee, so the declaration would be silently dropped and every reference would throw at hydrate. The loud refusal is the permanent answer for checker-less compiles; a compile that supplies a shared program (the Vite plugin does) resolves the primitive normally and never reaches it. Importing the primitive by name is the supported form.',
  fixtures: ['namespace-import-primitive'],
})
