/**
 * Pins the **ASI hazard contract** for emitted client JS. JavaScript's
 * automatic semicolon insertion fails to insert between certain
 * statement pairs — when the next statement starts with `(`, `[`, `\``,
 * `+`, `-`, `/`, the parser fuses it with the previous expression as
 * a call, member access, or template tag.
 *
 * Example from #1138:
 *
 *   ```js
 *   provideContext(ctx)        // intended: statement
 *   (globalThis)               // intended: another statement
 *   ```
 *
 *   The parser reads this as `provideContext(ctx)(globalThis)` — a
 *   single call expression — silently dropping the second statement.
 *
 * The staged-IR design tracks `needsLeadingSemi` on `InitStatementInfo`
 * (added in P1). P4 populates the field at analyzer time and reads it
 * at emit time so the hazard is closed structurally rather than relying
 * on minifier behavior.
 */

import { describe, test, expect } from 'bun:test'
import { compile, expectValidJs } from './helpers'

describe('ASI hazard: leading-`;` preserved on hazardous init statements', () => {
  test('init statement starting with `(` survives emission with leading `;`', () => {
    // Two top-level imperative statements where ASI would fuse:
    //   provideContext(ctx)
    //   (globalThis as any).__inited = true
    // Without a leading `;` on the second, the parser treats the
    // whole thing as `provideContext(ctx)(globalThis as any)`.
    const { clientJs, errors } = compile(`
      'use client'
      import { provideContext } from '@barefootjs/client'
      import { ctx } from './ctx'

      export function Foo() {
        provideContext(ctx)
        ;(globalThis).__inited = true
        return <div>hi</div>
      }
    `)

    expect(errors).toEqual([])
    expectValidJs(clientJs)
    // Either the second statement appears with a leading `;`, or the
    // statements are placed on lines such that ASI can't fuse them
    // (e.g. an explicit semicolon on the prior). The test accepts
    // either — what's banned is the fused single-call form.
    expect(clientJs).not.toMatch(/provideContext\([^)]*\)\s*\(globalThis/)
  })
})
