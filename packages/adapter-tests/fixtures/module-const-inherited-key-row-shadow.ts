import { createFixture } from '../src/types'

/**
 * Loop rows named like a local function (`value`) and a memo (`m`) that
 * read a key only a literal const's prototype has: the row is what the
 * server-rendered row reads, and the function and the memo are read only
 * from `/* @client *\/` positions, so the server render never spells the
 * inherited read and compiles.
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-row-shadow',
  description: 'loop rows named like a client-only function and memo reading an inherited const key render the row',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function ModuleConstInheritedKeyRowShadow() {
  const R = { k: 'v' }
  const m = createMemo(() => (R.toString ? 'y' : 'n'))
  function value() {
    return R.toString ? 'y' : 'n'
  }
  return (
    <div>
      <ul>
        {['ok'].map(value => (
          <li key={value}>{value}</li>
        ))}
      </ul>
      <ol>
        {['r'].map(m => (
          <li key={m}>{m}</li>
        ))}
      </ol>
      <p>{/* @client */ value()}|{/* @client */ m()}</p>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1"><li data-key="ok"><!--bf:s0-->ok<!--/--></li></ul>
      <ol bf="s3"><li data-key="r"><!--bf:s2-->r<!--/--></li></ol>
      <p bf="s6"><!--bf:s4--><!--/-->|<!--bf:s5--><!--/--></p>
    </div>
  `,
})
