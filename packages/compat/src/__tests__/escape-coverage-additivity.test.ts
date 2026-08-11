// Mechanical backstop for the additivity claim `escape-coverage.test.ts`'s
// header comment makes: the floor test derives its entire domain and
// ledger from `loadCompatAdapters()`, so landing a 9th (10th, …) adapter
// never requires editing that file or any fixture.
//
// The regression this guards against is exactly what maintainer review
// caught in #2615: a central `KNOWN_UNESCAPABLE: ReadonlySet<string>` in
// `packages/compat`'s test, keyed by `"adapterId/fixtureId"` — 112 string
// literals naming every DSL adapter by id. That shape makes a NEW
// adapter's escape debt invisible to the floor test until someone edits
// this package to add its name; the escape ledger moved onto
// `ConformancePin.unescapable` (declared in each adapter's own
// `conformance-pins.ts`) to fix that.
//
// A prose rule ("don't hardcode adapter ids here") is not itself a
// backstop — it's exactly the kind of claim that erodes under future
// edits unless something executable checks it. The strongest available
// check is structural: **if the test file contains no adapter-id string
// literal, it cannot special-case an adapter — coupling isn't merely
// avoided this time, there is nothing in the file for a future edit to
// key a per-adapter branch off without introducing a NEW literal, which
// this test catches the moment it's added.** This doesn't stop a
// determined future edit from adding one back — nothing short of a
// language-level ban could — but it does mean any regression of this
// class shows up as a failing assertion here, not as a silent shape
// change discovered on the next new-adapter PR.
//
// The forbidden-name list itself is derived from `loadCompatAdapters()`,
// not hardcoded — so this checker never goes stale as adapters are added
// or removed, the same additivity property it's verifying.

import { describe, expect, test } from 'bun:test'
import { loadCompatAdapters } from '../adapter-registry'

const { loaded } = await loadCompatAdapters()

// Both files that make up the floor test: the thin `describe`/`test`
// wrapper AND the plain module holding the actual domain/tier logic
// (`../escape-coverage.ts`) — the inversion this backstops could just as
// easily reappear in either one.
const CHECKED_FILES = [new URL('./escape-coverage.test.ts', import.meta.url), new URL('../escape-coverage.ts', import.meta.url)]

describe('escape-coverage floor names no adapter (additivity backstop, #2613)', () => {
  test('loads at least one adapter to check against', () => {
    // If this is empty the check below is vacuously true and proves
    // nothing — fail loudly instead of passing for the wrong reason.
    expect(loaded.length).toBeGreaterThan(0)
  })

  test('contains no "<adapterId>/" ledger-key-shaped string literal for any loaded adapter', async () => {
    const adapterIds = loaded.map(adapter => adapter.id)

    const offenders: string[] = []
    for (const fileUrl of CHECKED_FILES) {
      const source = await Bun.file(fileUrl).text()
      for (const id of adapterIds) {
        // All three JS string-literal openers. Backticks matter as much
        // as the quotes: the ledger key this backstops is a composed
        // `adapterId/fixtureId`, and a template literal
        // (`` `go-template/${fixtureId}` ``) is the most natural way to
        // reintroduce one — checking only ' and " would let exactly the
        // likeliest regression through.
        if (source.includes(`'${id}/`) || source.includes(`"${id}/`) || source.includes(`\`${id}/`)) {
          offenders.push(`${id} (in ${fileUrl.pathname.split('/').slice(-2).join('/')})`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
