import { createFixture } from '../src/types'

/**
 * An absent optional row member bound to an attribute is omitted when the
 * loop ranges over a signal array, read as a member (`r.tone`) or through a
 * destructured row param (`({ id, tone }) =>`), and in the rows of a nested
 * loop over a row field (`r.tags.map(t => …)`). A row that supplies the
 * member renders it. The props-array form with each attribute kind and
 * value is `loop-row-absent-optional-member-attr`.
 */
export const fixture = createFixture({
  id: 'loop-row-absent-optional-member-attr-sources',
  description: 'An absent optional row member omits its attribute in a signal-array, destructured and nested loop',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Tag = { label: string; tone?: string }
type Row = { id: number; tone?: string; tags: Tag[] }
export function LoopRowAbsentOptionalMemberAttrSources() {
  const [rows] = createSignal<Row[]>([
    { id: 1, tone: 'a', tags: [{ label: 'p', tone: 'q' }, { label: 'r' }] },
    { id: 2, tags: [{ label: 's' }] },
  ])
  return (
    <div>
      <ul>{rows().map((r) => <li key={r.id} data-tone={r.tone}>{r.tags.map((t) => <i key={t.label} data-tone={t.tone}>{t.label}</i>)}</li>)}</ul>
      <ol>{rows().map(({ id, tone }) => <li key={id} data-tone={tone}>{id}</li>)}</ol>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s3">
        <li bf="s2" data-key="1" data-tone="a">
          <i bf="s1" data-key-1="p" data-tone="q"><!--bf:s0-->p<!--/--></i>
          <i bf="s1" data-key-1="r"><!--bf:s0-->r<!--/--></i>
        </li>
        <li bf="s2" data-key="2"><i bf="s1" data-key-1="s"><!--bf:s0-->s<!--/--></i></li>
      </ul>
      <ol bf="s6">
        <li bf="s5" data-key="1" data-tone="a"><!--bf:s4-->1<!--/--></li>
        <li bf="s5" data-key="2"><!--bf:s4-->2<!--/--></li>
      </ol>
    </div>
  `,
})
