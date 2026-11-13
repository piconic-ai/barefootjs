import { createFixture } from '../src/types'

/**
 * An object const with a listed value (`H.safe`) and an arrow method that
 * reads a key only a literal const's prototype has (`H.get`). The server
 * render reads `H.safe` and never calls `H.get()`, which is called only
 * from a `/* @client *\/` position, so the component compiles.
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-object-safe',
  description: 'an object const read for a listed key renders it beside a client-only method reading an inherited key',
  source: `
'use client'
export function ModuleConstInheritedKeyObjectSafe() {
  const R = { k: 'v' }
  const H = { safe: 'ok', get: () => (R.toString ? 'y' : 'n') }
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
