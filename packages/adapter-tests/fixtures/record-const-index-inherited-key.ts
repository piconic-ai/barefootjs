import { createFixture } from '../src/types'

/**
 * A const record indexed by a prop whose keys are not known at compile time
 * (`kind: string`). JS reads an inherited key too: `labels['toString']` is
 * `Object.prototype.toString`, so the condition is true. A template
 * adapter has no such lookup, so it refuses the read (BF101) instead of
 * rendering `undefined` for every key the record does not list.
 */
export const fixture = createFixture({
  id: 'record-const-index-inherited-key',
  description: 'a const record indexed by a prop of unknown keys reads inherited keys too',
  escapes: [{ kind: 'client-directive', fixture: 'record-const-index-inherited-key-client' }],
  source: `
export function RecordConstIndexInheritedKey({ kind }: { kind: string }) {
  const labels: Record<string, string> = { ok: 'Fine' }
  return <p>{labels[kind] ? 'yes' : 'no'}</p>
}
`,
  props: { kind: 'toString' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf-cond-start:s0-->yes<!--bf-cond-end:s0--></p>
  `,
})
