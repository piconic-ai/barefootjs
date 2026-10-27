import { createFixture } from '../src/types'

/**
 * Destructure defaults that compute a scalar from literals and read no
 * earlier prop (`'abc'.length`, `'x'.toUpperCase()`, `[3, 1].length`,
 * `['a', 'b'].join('-')`, `Math.max(1, 2)`, `` `a-${1 + 1}` ``): an omitted prop takes the
 * computed value, and a passed `0` / `''` stays the caller's value.
 */
export const fixture = createFixture({
  id: 'destructure-default-computed-scalar',
  description: 'Destructure defaults computing a scalar from literals render their value when the prop is omitted',
  source: `
'use client'
export function DestructureDefaultComputedScalar({
  n = 'abc'.length,
  s = 'x'.toUpperCase(),
  k = [3, 1].length,
  j = ['a', 'b'].join('-'),
  m = Math.max(1, 2),
  t = \`a-\${1 + 1}\`,
}: { n?: number; s?: string; k?: number; j?: string; m?: number; t?: string }) {
  return <p data-n={n}>{n}|{s}|{k}|{j}|{m}|{t}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s6" data-n="3"><!--bf:s0-->3<!--/-->|<!--bf:s1-->X<!--/-->|<!--bf:s2-->2<!--/-->|<!--bf:s3-->a-b<!--/-->|<!--bf:s4-->2<!--/-->|<!--bf:s5-->a-2<!--/--></p>
  `,
  dataPoints: [
    { name: 'all-passed', props: { n: 7, s: 'q', k: 5, j: 'z', m: 9, t: 'u' } },
    { name: 'falsy-passed', props: { n: 0, s: '', k: 0, j: '', m: 0, t: '' } },
  ],
})
