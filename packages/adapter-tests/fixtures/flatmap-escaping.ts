import { createFixture } from '../src/types'

/**
 * SSR/CSR escaping parity for flatMap block-body leaves (flatMap unification,
 * `spec/callback-fidelity.md` root cure). flatMap callbacks now ride the same
 * structured-segments + `renderPreamble()` machinery as map preambles, so
 * their leaf text interpolations gain the same `escapeText` parity with the
 * SSR JSX runtime. Cells carry `<`, `&`, and quotes to pin byte parity.
 */
export const fixture = createFixture({
  id: 'flatmap-escaping',
  description: 'special characters in flatMap block-body leaf text escape identically at SSR and CSR',
  source: `
function FlatEscape({ items }: { items: { id: string; tags: string[] }[] }) {
  return (
    <ul>
      {items.flatMap((it) => {
        return it.tags.map((t) => <li key={it.id + t}>{t}</li>)
      })}
    </ul>
  )
}
export { FlatEscape }
`,
  props: {
    items: [
      { id: 'a', tags: ['<i>tag</i>', 'x & y'] },
      { id: 'b', tags: ['"q"'] },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s0">
      <li>&lt;i&gt;tag&lt;/i&gt;</li>
      <li>x &amp; y</li>
      <li>&quot;q&quot;</li>
    </ul>
  `,
})
