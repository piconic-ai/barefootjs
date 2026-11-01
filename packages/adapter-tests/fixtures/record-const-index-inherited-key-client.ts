import { createFixture } from '../src/types'

/**
 * Escape twin for `record-const-index-inherited-key`: the same read, marked
 * `/* @client *\/`, so it is evaluated in the browser instead of refusing
 * SSR.
 */
export const fixture = createFixture({
  id: 'record-const-index-inherited-key-client',
  description: 'a /* @client */ read of a const record indexed by a prop of unknown keys defers to the browser',
  source: `
'use client'
export function RecordConstIndexInheritedKeyClient({ kind }: { kind: string }) {
  const labels: Record<string, string> = { ok: 'Fine' }
  return <p>{/* @client */ labels[kind] ? 'yes' : 'no'}</p>
}
`,
  props: { kind: 'toString' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf-cond-start:s0--><!--bf-cond-end:s0--></p>
  `,
})
