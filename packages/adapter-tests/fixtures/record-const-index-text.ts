import { createFixture } from '../src/types'

/**
 * A const record indexed by a prop (`labels[kind]`) reads the value of that
 * key, as JS does, in a text child, a condition and a `??` fallback, and
 * `undefined` for a key the record does not list (`other`). Inside a loop
 * the row is the index. The attribute form is `record-index-lookup`.
 */
export const fixture = createFixture({
  id: 'record-const-index-text',
  description: 'a const record indexed by a prop reads the value of that key in text and conditions',
  source: `
export function RecordConstIndexText({ kind, other }: { kind: 'ok' | 'err'; other: string }) {
  const labels: Record<string, string> = { ok: 'Fine', err: 'Broken' }
  return (
    <div>
      {labels[kind]}|{labels[other]}|{labels[other] ?? 'none'}
      {labels[kind] === 'Broken' ? <b>bad</b> : <i>good</i>}
      <ul>{['ok', 'err'].map(k => <li key={k}>{labels[k]}</li>)}</ul>
    </div>
  )
}
`,
  props: { kind: 'err', other: 'nope' },
  expectedHtml: `
    <div bf-s="test" bf="s6">
      <!--bf:s0-->Broken<!--/-->|<!--bf:s1-->
      <!--/-->|<!--bf:s2-->none<!--/-->
      <b bf-c="s3">bad</b>
      <ul bf="s5">
        <li data-key="ok"><!--bf:s4-->Fine<!--/--></li>
        <li data-key="err"><!--bf:s4-->Broken<!--/--></li>
      </ul>
    </div>
  `,
})
