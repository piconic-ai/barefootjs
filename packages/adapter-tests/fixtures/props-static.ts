import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'props-static',
  description: 'Stateless component with destructured props',
  source: `
export function PropsStatic({ label, count }: { label: string; count: number }) {
  return <div><span>{label}</span><span>{count}</span></div>
}
`,
  props: { label: 'Items', count: 10 },
  // Escaping and number-rendering parity on the plainest prop
  // interpolation: markup must arrive escaped, entities must not be
  // double-escaped, and 0 / negative counts render as JS spells them.
  dataPoints: [
    { name: 'markup-label', props: { label: '<script>alert(1)</script>', count: 1 } },
    { name: 'entity-mix', props: { label: `&"'<>`, count: 1 } },
    { name: 'unicode', props: { label: '日本語🎉', count: 1 } },
    { name: 'zero-count', props: { label: 'Items', count: 0 } },
    { name: 'negative-count', props: { label: 'Items', count: -5 } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->Items<!--/--></span>
      <span bf="s3"><!--bf:s2-->10<!--/--></span>
    </div>
  `,
})
