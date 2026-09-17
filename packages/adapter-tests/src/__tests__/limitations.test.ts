/**
 * Lint for the known-limitation registry (`packages/adapter-tests/limitations/`).
 *
 * The registry is the source of truth for what is limited; this test
 * keeps every entry in the one fixed shape `src/limitations.ts` documents
 * so entries read alike and never grow into prose reports:
 *
 *   - every file in the directory loads as an entry (discovery is the
 *     directory listing itself, so there is no second list to drift);
 *   - the id (file name) is a kebab-case slug;
 *   - every text slot is one line with no trailing period;
 *   - `given` names no adapter (affected adapters are derived from pins);
 *   - `actual` (silent kind) starts with a verb;
 *   - no slot references an issue or PR (`#1234`, a github.com URL) —
 *     those pointers rot; git history holds the story;
 *   - `fixtures` is non-empty, each id exists in the corpus, is not an
 *     escape twin, and is claimed by exactly one entry.
 *
 * The other half — every pin cites an existing id, every listed fixture
 * is actually pinned under that id somewhere — needs every adapter
 * loaded and lives in `packages/compat/src/__tests__/limitations-join.test.ts`.
 */

import { describe, test, expect } from 'bun:test'
import { resolve } from 'node:path'
import { npmPublishablePackages } from '../../../../scripts/lib/npm-packages'
import { jsxFixtures } from '../../fixtures'
import { limitations, listLimitationIds } from '../../limitations'
import { LIMITATION_ID_RE, limitationDiagnostics, type Limitation } from '../limitations'

const repoRoot = resolve(import.meta.dir, '../../../..')

/**
 * Words that name an adapter, derived from the workspace: every published
 * `packages/adapter-*` package's short name (`@barefootjs/go-template` →
 * `go-template`), plus its space-separated spelling. Not hand-listed, so a
 * new adapter package is covered the moment it exists. Adapter *ids* that
 * differ from the package name (`minijinja` for `@barefootjs/rust`) are
 * checked from the loaded adapters in `limitations-join.test.ts`.
 */
const ADAPTER_WORDS = npmPublishablePackages(repoRoot)
  .filter(p => p.rel.startsWith('packages/adapter-'))
  .map(p => p.pkg.name.replace(/^@barefootjs\//, ''))
  .flatMap(name => (name.includes('-') ? [name, name.replace(/-/g, ' ')] : [name]))

/** `actual` must say what renders, starting with a verb from this (growable) list. */
const ACTUAL_VERBS = ['renders', 'emits', 'drops', 'seeds', 'reuses', 'omits', 'leaves', 'keeps', 'throws', 'mirrors']

const ISSUE_REF_RE = /(^|[^\w/`])#\d+\b|github\.com/i

function textSlots(entry: Limitation): Array<[string, string]> {
  const slots: Array<[string, string]> = [
    ['title', entry.title],
    ['given', entry.given],
    ['expected', entry.expected],
  ]
  if (entry.kind === 'silent') slots.push(['actual', entry.actual])
  if (entry.kind === 'by-design') slots.push(['reason', entry.reason])
  return slots
}

/** Every `escapes[].fixture` id declared anywhere in the corpus — never a limitation's own repro. */
const escapeTwinIds = new Set(jsxFixtures.flatMap(f => (f.escapes ?? []).map(e => e.fixture)))
const corpusIds = new Set(jsxFixtures.map(f => f.id))

describe('limitation registry', () => {
  test('every file in the directory is loaded as an entry, in id order', () => {
    expect(limitations.map(l => l.id)).toEqual(listLimitationIds())
  })

  test('at least one entry is registered', () => {
    expect(limitations.length).toBeGreaterThan(0)
  })

  test('no fixture is claimed by two entries', () => {
    const owners = new Map<string, string[]>()
    for (const entry of limitations) {
      for (const fixtureId of entry.fixtures) {
        owners.set(fixtureId, [...(owners.get(fixtureId) ?? []), entry.id])
      }
    }
    const shared = [...owners.entries()].filter(([, ids]) => ids.length > 1)
    expect(shared).toEqual([])
  })

  for (const entry of limitations) {
    describe(entry.id, () => {
      test('id is a kebab-case slug', () => {
        expect(entry.id).toMatch(LIMITATION_ID_RE)
      })

      for (const [name, text] of textSlots(entry)) {
        test(`${name} is one line with no trailing period`, () => {
          expect(text.trim()).toBe(text)
          expect(text.length).toBeGreaterThan(0)
          expect(text).not.toMatch(/\n/)
          if (name !== 'reason') expect(text).not.toMatch(/\.$/)
        })

        test(`${name} references no issue or PR`, () => {
          expect(text).not.toMatch(ISSUE_REF_RE)
        })
      }

      test('given names no adapter package (affected adapters are derived from pins)', () => {
        expect(ADAPTER_WORDS.length).toBeGreaterThan(0)
        const lower = entry.given.toLowerCase()
        const named = ADAPTER_WORDS.filter(w => new RegExp(`(^|[^a-z-])${w}([^a-z-]|$)`).test(lower))
        expect(named).toEqual([])
      })

      if (entry.kind === 'silent') {
        test('actual starts with a verb', () => {
          const first = entry.actual.split(/\s+/)[0].toLowerCase()
          expect(ACTUAL_VERBS).toContain(first)
        })
      } else {
        test('diagnostic codes are BFnnn', () => {
          const codes = limitationDiagnostics(entry)
          expect(codes.length).toBeGreaterThan(0)
          for (const code of codes) expect(code).toMatch(/^BF\d{3}$/)
        })
      }

      test('fixtures are non-empty, unique, in the corpus, and not escape twins', () => {
        expect(entry.fixtures.length).toBeGreaterThan(0)
        expect(new Set(entry.fixtures).size).toBe(entry.fixtures.length)
        const missing = entry.fixtures.filter(id => !corpusIds.has(id))
        expect(missing).toEqual([])
        const twins = entry.fixtures.filter(id => escapeTwinIds.has(id))
        expect(twins).toEqual([])
      })
    })
  }
})
