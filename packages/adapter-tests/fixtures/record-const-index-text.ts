import { createFixture } from '../src/types'

/**
 * A const record indexed by a prop typed as a union of string literals
 * (`labels[kind]`) reads the value of that key, as JS does, in a text child,
 * a condition and a `??` fallback, and `undefined` for a key the record does
 * not list (`other` is `'nope'`). The attribute form is
 * `record-index-lookup`; an index whose keys are not known is
 * `record-const-index-inherited-key`.
 */
export const fixture = createFixture({
  id: 'record-const-index-text',
  description: 'a const record indexed by a prop reads the value of that key in text and conditions',
  source: `
export function RecordConstIndexText({ kind, other }: { kind: 'ok' | 'err'; other: 'ok' | 'err' | 'nope' }) {
  const labels: Record<string, string> = { ok: 'Fine', err: 'Broken' }
  return (
    <div>
      {labels[kind]}|{labels[other]}|{labels[other] ?? 'none'}
      {labels[kind] === 'Broken' ? <b>bad</b> : <i>good</i>}
    </div>
  )
}
`,
  props: { kind: 'err', other: 'nope' },
  expectedHtml: `
    <div bf-s="test" bf="s4"><!--bf:s0-->Broken<!--/-->|<!--bf:s1--><!--/-->|<!--bf:s2-->none<!--/--><b bf-c="s3">bad</b></div>
  `,
})
