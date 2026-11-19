import { createFixture } from '../src/types'

/**
 * A `.map()` callback preamble local built from a TEMPLATE LITERAL (#3936).
 *
 * The go-template adapter lowers each preamble declaration to one
 * `{{$label := …}}` per-row variable. A template literal rendered through the
 * TEXT-position path is literal text interleaved with `{{…}}` actions, which
 * is not a legal initializer: the template failed to parse at render time
 * (`unexpected "[" in command`). The initializer must lower to ONE pipeline
 * value (`bf_concat_str …`), the same door a helper-call argument uses.
 *
 * Sibling shapes covered here: a leading/trailing static part (`[x]`), the row
 * index and a number interpolation (`x@0`), a later local reading an earlier
 * template-literal local, a ternary inside the interpolation, a template literal as a ternary branch with a method call, a nested loop, a local read as
 * an attribute value and as text, and a filtered loop.
 */
export const fixture = createFixture({
  id: 'loop-preamble-template-literal',
  description: 'Loop row preamble local built from a template literal (brackets, index, number, ternary, chained local)',
  componentName: 'LoopPreambleTemplateLiteral',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; name: string; qty: number; on: boolean; parts: number[] }
export function LoopPreambleTemplateLiteral(props: { rows: Row[] }) {
  const [rows, setRows] = createSignal<Row[]>(props.rows)
  return (
    <div>
      <ul>
        {rows().map((row, i) => {
          const label = \`[\${row.name}]\`
          const tag = \`\${row.name}@\${i}\`
          const qty = \`\${row.qty}x \${row.on ? 'on' : 'off'}\`
          const both = \`\${label}/\${tag}\`
          const pick = row.on ? \`on:\${row.name}\` : \`off:\${row.name.toUpperCase()}\`
          return (
            <li key={row.id} title={tag}>{label} {tag} {qty} {both} {pick}</li>
          )
        })}
      </ul>
      <section>
        {rows().map(row => (
          <p key={row.id}>
            {row.parts.map(n => {
              const cell = \`\${row.name}#\${n}\`
              return <b key={n}>{cell}</b>
            })}
          </p>
        ))}
      </section>
      <ol>
        {rows().filter(r => r.on).map(row => {
          const label = \`<\${row.name}>\`
          return <li key={row.id}>{label}</li>
        })}
      </ol>
    </div>
  )
}
`,
  props: {
    rows: [
      { id: 1, name: 'ann', qty: 2, on: true, parts: [1, 2] },
      { id: 2, name: 'bob', qty: 0, on: false, parts: [3] },
    ],
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s6">
        <li bf="s5" data-key="1" title="ann@0"><!--bf:s0-->[ann]<!--/--><!--bf:s1-->ann@0<!--/--><!--bf:s2-->2x on<!--/--><!--bf:s3-->[ann]/ann@0<!--/--><!--bf:s4-->on:ann<!--/--></li>
        <li bf="s5" data-key="2" title="bob@1"><!--bf:s0-->[bob]<!--/--><!--bf:s1-->bob@1<!--/--><!--bf:s2-->0x off<!--/--><!--bf:s3-->[bob]/bob@1<!--/--><!--bf:s4-->off:BOB<!--/--></li>
      </ul>
      <section bf="s8">
        <p bf="s7" data-key="1">
          <b data-key-1="1">ann#1</b>
          <b data-key-1="2">ann#2</b>
        </p>
        <p bf="s7" data-key="2"><b data-key-1="3">bob#3</b></p>
      </section>
      <ol bf="s10"><li data-key="1"><!--bf:s9-->&lt;ann&gt;<!--/--></li></ol>
    </div>
  `,
  dataPoints: [{ name: 'empty', props: { rows: [] } }],
})
