import { createFixture } from '../src/types'

/**
 * A const record indexed by a prop in the text child of an early return
 * (`if (empty) return <p>{labels[kind]}</p>`) reads the value of that key.
 */
export const fixture = createFixture({
  id: 'record-const-index-early-return',
  description: 'a const record indexed by a prop reads the value of that key in an early return',
  source: `
export function RecordConstIndexEarlyReturn({ kind, empty }: { kind: 'ok' | 'err'; empty?: boolean }) {
  const labels: Record<'ok' | 'err', string> = { ok: 'Fine', err: 'Broken' }
  if (empty) {
    return <p>{labels[kind]}</p>
  }
  return <div>{kind}</div>
}
`,
  props: { kind: 'err', empty: true },
  expectedHtml: `
    <p bf-s="test" bf="s3"><!--bf:s2-->Broken<!--/--></p>
  `,
})
