import { createFixture } from '../src/types'

/**
 * An integral destructure default past int64 (`1e20`) applies its value
 * (100000000000000000000, JS `String(1e20)`) to an absent prop only, so an
 * explicit `0` stays the caller's value: in text and in an attribute. An
 * engine that holds the default as an integer overflows it, and one that
 * prints a float with its native spelling renders `1e+20`.
 */
export const fixture = createFixture({
  id: 'destructure-default-large-number',
  description: 'An integral destructure default past int64 applies 100000000000000000000 when absent and keeps an explicit 0',
  source: `
export function DestructureDefaultLargeNumber({ b = 1e20 }: { b?: number }) {
  return <p data-b={b}>{b}</p>
}
`,
  props: { b: 0 },
  expectedHtml: `
    <p bf-s="test" bf="s1" data-b="0"><!--bf:s0-->0<!--/--></p>
  `,
  dataPoints: [
    { name: 'absent', props: {} },
  ],
})
