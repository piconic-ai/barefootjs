import { createFixture } from '../src/types'

/**
 * A body statement that runs a callback in place, where a block inside the
 * callback declares a `local` of its own and the callback then writes the
 * component's `local` after that block:
 *
 *   [1].forEach(x => { if (x) { const local = [] }; local.push('z') })
 *
 * The block's `local` shadows the component's only inside the block, so the
 * `push` after it writes the component's array and JS renders `2`. A
 * template renders `local` from its declaration (`1`), so the markup's read
 * is refused (BF101, `checkStatementWrites`) in the shared compile, ahead of
 * any adapter, and pinned on every adapter including the reference: the
 * limitation `body-statement-write-read-as-declared`. The statement's writes
 * are collected with real lexical scopes (`walkWithScope`): a name a nested
 * block declares hides the component's binding for that block, not for the
 * whole callback.
 */
export const fixture = createFixture({
  id: 'body-statement-write-block-shadowed-callback',
  description: 'A write in an in-place callback, after a block that declares the same name, is a write to the component binding',
  source: `
'use client'
export function BodyStatementWriteBlockShadowedCallback() {
  const local = ['y']
  ;[1].forEach(x => { if (x) { const local: string[] = []; local.length }; local.push('z') })
  return <p>{local.length}</p>
}
`,
  escapes: [
    { kind: 'rewrite', fixture: 'body-statement-write-rewrite' },
    { kind: 'client-directive', fixture: 'body-statement-write-direct-read-client' },
  ],
})
