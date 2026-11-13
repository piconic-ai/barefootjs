import { createFixture } from '../src/types'

/**
 * A module object const with a listed value (`H.safe`) and an arrow method that
 * reads a key only a literal const's prototype has (`H.get`): the server
 * render spells only `H.safe`, and `H.get()` is called only from a
 * `/* @client *\/` position, so the component compiles.
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-object-safe',
  description: 'an object const read for a listed key renders it beside a client-only method reading an inherited key',
  source: `
'use client'
const R = { k: 'v' }
const H = { safe: 'ok', get: () => (R.toString ? 'y' : 'n') }
export function ModuleConstInheritedKeyObjectSafe() {
  return (
    <p>
      {H.safe}|{/* @client */ H.get()}
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test">ok|<!--bf:s0--><!--/--></p>
  `,
})
