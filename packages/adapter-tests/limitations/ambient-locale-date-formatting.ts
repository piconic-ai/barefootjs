import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'by-design',
  title: 'Ambient-locale Date formatting',
  given: 'a `Date`-typed prop formatted with zero-argument `toLocaleDateString()` (no explicit locale or options)',
  expected: 'the date renders formatted for the server process default locale',
  diagnostic: 'BF021',
  reason:
    'The zero-argument form resolves against the runtime environment ambient locale (ICU/CLDR data, `LC_*`), which is not knowable at build time and differs across every backend language and between the server and the browser. Any lowering would be a silent SSR/CSR divergence; a Hono carve-out was tried and rejected because hydration re-evaluates the expression against a JSON-de-riched receiver. The literal-locale and named-timezone forms are lowered instead.',
  fixtures: ['date-method-uncatalogued'],
})
