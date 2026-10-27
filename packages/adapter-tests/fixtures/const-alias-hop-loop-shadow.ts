import { createFixture } from '../src/types'

/**
 * A component-scope const alias hop of a prop, read inside a loop row or a
 * callback that binds a name the hop passes through (#3696). The hop and
 * its initializers resolve in the component scope, so every read holds the
 * prop, in each position a template lowers separately:
 *
 * - `Page`: `const a = label; const b = a` read as `{b}` in
 *   `rows.map(a => …)` as text, attribute, ternary, `&&`, a child prop, a
 *   filter predicate whose param is also `a`, and a nested loop; and
 *   `const c = label` read in `rows.map(label => …)`, where the row
 *   shadows the prop itself.
 * - `Literal`: literal const hops (`const n = 1e3; const m = n`, hex and
 *   fraction) read in rows that bind the literal const's name
 *   (`rows.map(n => …)`); `Page` does the same for an escaped string.
 * - `PropsObject`: `function C(props)` with a renamed body destructure
 *   (`const { label: text } = props; const c = text`) read in
 *   `props.rows.map(text => …)`.
 *
 * The children prop's version is `children-alias-hop-shadowed-intermediate`.
 */
export const fixture = createFixture({
  id: 'const-alias-hop-loop-shadow',
  description: 'A const alias hop of a prop read under a loop row or callback that shadows a name it passes through keeps the prop',
  source: `
'use client'
import { Literal, PropsObject } from './list'

function Badge({ text }: { text: string }) {
  return <i className="badge">{text}</i>
}

export function Page({ label, rows }: { label: string; rows: string[] }) {
  const a = label
  const b = a
  const c = label
  const s = 'q"<&>\\'s'
  const sm = s
  return (
    <main>
      <ul className="row-a">
        {rows.map(a => (
          <li key={a} title={b} data-same={a === b ? 'y' : 'n'}>
            {b}|{a}|{b ? 'on' : 'off'}{b && <em>{b}</em>}
            <Badge text={b} />
            <span>{rows.filter(a => a !== b).length}</span>
            <ol>{rows.map(x => <li key={x}>{rows.map(a => <b key={a}>{b}</b>)}</li>)}</ol>
          </li>
        ))}
      </ul>
      <ul className="row-label">{rows.map(label => <li key={label} title={c}>{c}/{label}</li>)}</ul>
      <ul className="string">{rows.map(s => <li key={s} data-m={sm}>{sm}/{s}</li>)}</ul>
      <Literal rows={rows} />
      <PropsObject label={label} rows={rows} />
    </main>
  )
}
`,
  props: { label: 'L<x>', rows: ['r1', 'L<x>'] },
  components: {
    './list.tsx': `
'use client'
export function Literal({ rows }: { rows: string[] }) {
  const n = 1e3
  const m = n
  const h = 0x10
  const hm = h
  const f = .5
  const fm = f
  return (
    <ul className="literal">
      {rows.map(n => <li key={n} data-m={m}>{m}/{n}</li>)}
      {rows.map(h => <li key={h} data-m={hm}><span>{hm}</span><span>{rows.map(f => <b key={f}>{fm}</b>)}</span></li>)}
    </ul>
  )
}
export function PropsObject(props: { label: string; rows: string[] }) {
  const { label: text } = props
  const c = text
  return <ul className="props-object">{props.rows.map(text => <li key={text} title={c}>{c}/{text}</li>)}</ul>
}
`,
  },
  expectedHtml: `
    <main bf-s="test">
      <ul bf="s14" class="row-a">
        <li bf="s13" data-key="r1" data-same="n" title="L&lt;x&gt;">
          <!--bf:s0-->L&lt;x&gt;<!--/-->|<!--bf:s1-->r1<!--/-->|<!--bf-cond-start:s2-->on<!--bf-cond-end:s2-->
          <em bf-c="s3" bf="s5"><!--bf:s4-->L&lt;x&gt;<!--/--></em>
          <i bf-s="test_s6" bf="s1" class="badge"><!--bf:s0-->L&lt;x&gt;<!--/--></i>
          <span bf="s8"><!--bf:s7-->1<!--/--></span>
          <ol bf="s12">
            <li bf="s11" data-key-1="r1">
              <b bf="s10" data-key-2="r1"><!--bf:s9-->L&lt;x&gt;<!--/--></b>
              <b bf="s10" data-key-2="L&lt;x&gt;"><!--bf:s9-->L&lt;x&gt;<!--/--></b>
            </li>
            <li bf="s11" data-key-1="L&lt;x&gt;">
              <b bf="s10" data-key-2="r1"><!--bf:s9-->L&lt;x&gt;<!--/--></b>
              <b bf="s10" data-key-2="L&lt;x&gt;"><!--bf:s9-->L&lt;x&gt;<!--/--></b>
            </li>
          </ol>
        </li>
        <li bf="s13" data-key="L&lt;x&gt;" data-same="y" title="L&lt;x&gt;">
          <!--bf:s0-->L&lt;x&gt;<!--/-->|<!--bf:s1-->L&lt;x&gt;<!--/-->|<!--bf-cond-start:s2-->on<!--bf-cond-end:s2-->
          <em bf-c="s3" bf="s5"><!--bf:s4-->L&lt;x&gt;<!--/--></em>
          <i bf-s="test_s6" bf="s1" class="badge"><!--bf:s0-->L&lt;x&gt;<!--/--></i>
          <span bf="s8"><!--bf:s7-->1<!--/--></span>
          <ol bf="s12">
            <li bf="s11" data-key-1="r1">
              <b bf="s10" data-key-2="r1"><!--bf:s9-->L&lt;x&gt;<!--/--></b>
              <b bf="s10" data-key-2="L&lt;x&gt;"><!--bf:s9-->L&lt;x&gt;<!--/--></b>
            </li>
            <li bf="s11" data-key-1="L&lt;x&gt;">
              <b bf="s10" data-key-2="r1"><!--bf:s9-->L&lt;x&gt;<!--/--></b>
              <b bf="s10" data-key-2="L&lt;x&gt;"><!--bf:s9-->L&lt;x&gt;<!--/--></b>
            </li>
          </ol>
        </li>
      </ul>
      <ul bf="s18" class="row-label">
        <li bf="s17" data-key="r1" title="L&lt;x&gt;"><!--bf:s15-->L&lt;x&gt;<!--/-->/<!--bf:s16-->r1<!--/--></li>
        <li bf="s17" data-key="L&lt;x&gt;" title="L&lt;x&gt;"><!--bf:s15-->L&lt;x&gt;<!--/-->/<!--bf:s16-->L&lt;x&gt;<!--/--></li>
      </ul>
      <ul bf="s20" class="string">
        <li data-key="r1" data-m="q&quot;&lt;&amp;&gt;&#39;s">q&quot;&lt;&amp;&gt;&#39;s/<!--bf:s19-->r1<!--/--></li>
        <li data-key="L&lt;x&gt;" data-m="q&quot;&lt;&amp;&gt;&#39;s">q&quot;&lt;&amp;&gt;&#39;s/<!--bf:s19-->L&lt;x&gt;<!--/--></li>
      </ul>
      <ul bf-s="test_s21" bf="s2" class="literal">
        <li data-key="r1" data-m="1000">1000/<!--bf:s0-->r1<!--/--></li>
        <li data-key="L&lt;x&gt;" data-m="1000">1000/<!--bf:s0-->L&lt;x&gt;<!--/--></li>
        <li data-key="r1" data-m="16">
          <span>16</span>
          <span bf="s1">
            <b data-key-1="r1">0.5</b>
            <b data-key-1="L&lt;x&gt;">0.5</b>
          </span>
        </li>
        <li data-key="L&lt;x&gt;" data-m="16">
          <span>16</span>
          <span bf="s1">
            <b data-key-1="r1">0.5</b>
            <b data-key-1="L&lt;x&gt;">0.5</b>
          </span>
        </li>
      </ul>
      <ul bf-s="test_s22" bf="s3" class="props-object">
        <li bf="s2" data-key="r1" title="L&lt;x&gt;"><!--bf:s0-->L&lt;x&gt;<!--/-->/<!--bf:s1-->r1<!--/--></li>
        <li bf="s2" data-key="L&lt;x&gt;" title="L&lt;x&gt;"><!--bf:s0-->L&lt;x&gt;<!--/-->/<!--bf:s1-->L&lt;x&gt;<!--/--></li>
      </ul>
    </main>
  `,
})
