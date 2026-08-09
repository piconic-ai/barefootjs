/**
 * Shrink-only ledger of direct uses of the legacy ad-hoc
 * "names bound by a loop callback" mechanisms #2482 replaces with the one
 * shared `BindingScope` service (`packages/jsx/src/scope/binding-scope.ts`).
 *
 * #2482 counts SIX such mechanisms; this ledger tracks FIVE textual
 * patterns because two of the six have no greppable device name of their
 * own: `csr-substitute.ts`'s `boundStack` is a function-local variable
 * (migrated in Stage 1 by changing that one function, no ledger pattern
 * needed), and `html-template.ts`'s `opts.loopBoundNames` shares the
 * `loopBoundNames` spelling with the per-adapter ref-counted maps, so one
 * pattern covers both.
 * Modeled in spirit on `map-body-no-silent-divergence.test.ts`'s known-hole
 * ledger: a known-inventory of the current reality that may only shrink as
 * Stages 1-4 migrate call sites onto `BindingScope`, never grow.
 *
 * Scans every `.ts` file under `packages/jsx/src/` and each `packages/adapter-X/src/`
 * (excluding `__tests__` directories, `*.test.ts` files, and
 * `packages/jsx/src/scope/` itself — the new module legitimately mentions
 * its own migration target names in doc comments) for five forbidden
 * substrings:
 *
 *   - `localConstants.find(`   — ad-hoc linear scan for a shadowing local
 *   - `staticLoopSourceBoundNames` — a per-adapter shadow-name Set
 *   - `loopBoundNames`         — `collectLoopBoundNames`'s flat name Set
 *   - `loopParamStack`         — the Go adapter's own loop-param stack
 *   - `loopParams`             — `jsx-to-ir.ts`'s mutable `ctx.loopParams` Set
 *
 * ALLOWLIST pins the EXACT count of each pattern in each file as of Stage 0
 * (#2482). Every assertion below must hold EXACTLY — not "at most" — so the
 * ledger stays a live, precise record instead of a one-way ratchet that
 * silently tolerates drift in either direction:
 *
 *   - A count ABOVE its allowlisted value means a NEW direct use of a
 *     legacy scope device was added — use `BindingScope`
 *     (`packages/jsx/src/scope/binding-scope.ts`) instead; see #2482.
 *   - A count BELOW its allowlisted value means legacy use was removed
 *     (progress!) — shrink the corresponding `ALLOWLIST` entry to keep the
 *     ledger exact, don't leave a stale higher number sitting there.
 *
 * Counts are total substring OCCURRENCES per file (a line with the pattern
 * twice counts twice), not matching-line counts.
 */

import { describe, test, expect } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..')

const PATTERNS = [
  'localConstants.find(',
  'staticLoopSourceBoundNames',
  'loopBoundNames',
  'loopParamStack',
  'loopParams',
] as const
type Pattern = (typeof PATTERNS)[number]

/**
 * Exact per-file, per-pattern occurrence counts as of #2482 Stage 0. Only
 * ever shrinks — see header comment. A missing file or missing pattern key
 * means an expected count of 0.
 */
const ALLOWLIST: Record<string, Partial<Record<Pattern, number>>> = {
  'packages/adapter-erb/src/adapter/erb-adapter.ts': { 'localConstants.find(': 1 },
  'packages/adapter-go-template/src/adapter/expr/helper-inline.ts': { 'localConstants.find(': 1 },
  'packages/adapter-go-template/src/adapter/go-template-adapter.ts': {
    'localConstants.find(': 5,
    staticLoopSourceBoundNames: 3,
    loopParamStack: 35,
  },
  'packages/adapter-go-template/src/adapter/lib/compile-state.ts': { staticLoopSourceBoundNames: 1, loopParamStack: 1 },
  'packages/adapter-go-template/src/adapter/memo/ctor-lowering.ts': { 'localConstants.find(': 3 },
  'packages/adapter-go-template/src/adapter/memo/memo-value.ts': { 'localConstants.find(': 1 },
  'packages/adapter-mojolicious/src/adapter/mojo-adapter.ts': {
    'localConstants.find(': 1,
  },
  'packages/jsx/src/adapters/jsx-adapter.ts': { 'localConstants.find(': 1 },
  'packages/jsx/src/augment-inherited-props.ts': { 'localConstants.find(': 1 },
  'packages/jsx/src/css-layer-prefixer.ts': { 'localConstants.find(': 1 },
  'packages/jsx/src/debug.ts': { loopParams: 18 },
  'packages/jsx/src/free-refs.ts': { 'localConstants.find(': 1, loopParams: 4 },
  'packages/jsx/src/ir-to-client-js/collect-elements.ts': { loopParams: 9 },
  'packages/jsx/src/ir-to-client-js/compute-inlinability.ts': { 'localConstants.find(': 1 },
  'packages/jsx/src/ir-to-client-js/control-flow/plan/build-event-delegation.ts': { loopParams: 4 },
  'packages/jsx/src/ir-to-client-js/html-template.ts': { loopParams: 16 },
  'packages/jsx/src/ir-to-client-js/prop-handling.ts': { 'localConstants.find(': 2 },
  'packages/jsx/src/ir-to-client-js/utils.ts': { loopParams: 3 },
  'packages/jsx/src/jsx-to-ir.ts': { loopParams: 1 },
}

const SCOPE_MODULE_DIR = join(REPO_ROOT, 'packages', 'jsx', 'src', 'scope')

function listTsFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (entry === '__tests__') continue
      if (full === SCOPE_MODULE_DIR) continue
      listTsFiles(full, out)
    } else if (st.isFile() && entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full)
    }
  }
}

function countOccurrences(text: string, pattern: string): number {
  let count = 0
  let idx = 0
  while (true) {
    const found = text.indexOf(pattern, idx)
    if (found === -1) break
    count++
    idx = found + pattern.length
  }
  return count
}

function scan(): Record<string, Partial<Record<Pattern, number>>> {
  const roots: string[] = [join(REPO_ROOT, 'packages', 'jsx', 'src')]
  const packagesDir = join(REPO_ROOT, 'packages')
  for (const entry of readdirSync(packagesDir)) {
    if (!entry.startsWith('adapter-')) continue
    const srcDir = join(packagesDir, entry, 'src')
    try {
      if (statSync(srcDir).isDirectory()) roots.push(srcDir)
    } catch {
      // no src dir for this package — skip
    }
  }

  const files: string[] = []
  for (const root of roots) listTsFiles(root, files)

  const result: Record<string, Partial<Record<Pattern, number>>> = {}
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const counts: Partial<Record<Pattern, number>> = {}
    for (const pattern of PATTERNS) {
      const c = countOccurrences(text, pattern)
      if (c > 0) counts[pattern] = c
    }
    if (Object.keys(counts).length > 0) {
      const rel = relative(REPO_ROOT, file).split(sep).join('/')
      result[rel] = counts
    }
  }
  return result
}

describe('legacy loop-scope device ledger (#2482) — shrink only', () => {
  const actual = scan()

  test('every scanned file matches its allowlisted counts exactly', () => {
    const allFiles = new Set([...Object.keys(actual), ...Object.keys(ALLOWLIST)])
    const mismatches: string[] = []

    for (const file of allFiles) {
      const actualCounts = actual[file] ?? {}
      const expectedCounts = ALLOWLIST[file] ?? {}
      const allPatterns = new Set<Pattern>([
        ...(Object.keys(actualCounts) as Pattern[]),
        ...(Object.keys(expectedCounts) as Pattern[]),
      ])
      for (const pattern of allPatterns) {
        const got = actualCounts[pattern] ?? 0
        const want = expectedCounts[pattern] ?? 0
        if (got > want) {
          mismatches.push(
            `${file} [${pattern}]: found ${got}, allowlisted ${want} — new direct use of legacy ` +
              `scope device — use BindingScope (packages/jsx/src/scope/binding-scope.ts) instead; see #2482`,
          )
        } else if (got < want) {
          mismatches.push(
            `${file} [${pattern}]: found ${got}, allowlisted ${want} — legacy use removed — ` +
              `shrink the ALLOWLIST entry to keep the ledger exact`,
          )
        }
      }
    }

    expect(mismatches).toEqual([])
  })
})
