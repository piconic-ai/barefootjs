import { createFixture } from '../src/types'

/**
 * `client-directive` twin of `loop-row-absent-optional-member-attr-module-const`:
 * the loops over the module consts are marked `/* @client *\/`, so they
 * defer to the browser instead of refusing SSR. SSR renders the containers
 * with no rows; the client runtime materialises them at hydration.
 */
export const fixture = createFixture({
  id: 'loop-row-absent-optional-member-attr-module-const-client',
  description: 'A /* @client */ loop over module-const rows that omit a member defers to the browser instead of refusing SSR',
  source: `
'use client'
type Row = { id: number; tone?: string }
const ROWS: Row[] = [{ id: 1, tone: 'k' }, { id: 2 }]
const RAW = [{ id: 1, tone: 'k' }, { id: 2 }, { id: 3, tone: null }]
export function LoopRowAbsentOptionalMemberAttrModuleConstClient() {
  return (
    <div>
      <ul>{/* @client */ ROWS.map((r) => <li key={r.id} data-tone={r.tone}>{r.id}</li>)}</ul>
      <ol>{/* @client */ ROWS.map(({ id, tone }) => <li key={id} data-tone={tone}>{id}</li>)}</ol>
      <p>{/* @client */ RAW.map((r) => <b key={r.id} data-tone={r.tone}>{r.id}</b>)}</p>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s2"></ul>
      <ol bf="s5"></ol>
      <p bf="s8"></p>
    </div>
  `,
})
