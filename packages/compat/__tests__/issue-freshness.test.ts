// Unit-pins the pure issue-URL collector (`issue-freshness.ts`): the
// shape-agnostic recursive walk must find every referenced issue in the
// lock JSON, dedupe by number, pool citations, and sort ascending — and it
// must also find them in the REAL committed locks (a lightweight guard that
// the matrix never links an issue this checker can't see). The GitHub-query
// half (`issue-freshness-cli.ts`) is network and stays untested here.

import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  REPO_SLUG,
  collectIssueRefs,
  collectIssueRefsFromLock,
  formatStaleReport,
  type StaleIssue,
} from '../src/issue-freshness'

const url = (n: number) => `https://github.com/${REPO_SLUG}/issues/${n}`

describe('collectIssueRefsFromLock', () => {
  test('finds issue URLs at any depth and records the citing path', () => {
    const lock = {
      components: {
        widget: {
          go: { diagnostics: [{ code: 'BF021', issues: [url(2356)] }] },
        },
      },
    }
    const refs = [...collectIssueRefsFromLock(lock, 'compat').values()]
    expect(refs).toHaveLength(1)
    expect(refs[0].number).toBe(2356)
    expect(refs[0].url).toBe(url(2356))
    expect(refs[0].citedBy).toEqual(['compat.components.widget.go.diagnostics[0].issues[0]'])
  })

  test('dedupes one issue cited from many places, pooling citations', () => {
    const lock = {
      a: { issues: [url(2320)] },
      b: { nested: { issue: url(2320) } },
    }
    const refs = [...collectIssueRefsFromLock(lock, 'L').values()]
    expect(refs).toHaveLength(1)
    expect(refs[0].number).toBe(2320)
    expect(refs[0].citedBy).toHaveLength(2)
  })

  test('tolerates trailing slash / fragment / query suffixes and collects every URL in a string', () => {
    const lock = {
      // A free-text field embedding two links with assorted suffixes — the
      // detector must catch BOTH, not just the first, and must not be thrown
      // by the trailing `/`, `#…`, or `?…`.
      reason: `superseded by ${url(2356)}/ (see also ${url(2320)}#issuecomment-1 and ${url(2321)}?foo=bar)`,
    }
    const refs = [...collectIssueRefsFromLock(lock, 'L').values()].sort((a, b) => a.number - b.number)
    expect(refs.map((r) => r.number)).toEqual([2320, 2321, 2356])
  })

  test('ignores non-issue GitHub URLs (labels, blobs)', () => {
    const lock = {
      knownLimitationLabel: `https://github.com/${REPO_SLUG}/labels/known-limitation`,
      dataSource: `https://github.com/${REPO_SLUG}/blob/main/ui/compat.lock.json`,
    }
    expect(collectIssueRefsFromLock(lock, 'L').size).toBe(0)
  })
})

describe('collectIssueRefs (multi-lock merge)', () => {
  test('merges across locks and sorts ascending by issue number', () => {
    const refs = collectIssueRefs([
      { label: 'compat', data: { x: { issues: [url(2321), url(2274)] } } },
      { label: 'support', data: { y: { issues: [url(2274)] } } },
    ])
    expect(refs.map((r) => r.number)).toEqual([2274, 2321])
    // #2274 pooled from both locks.
    expect(refs.find((r) => r.number === 2274)!.citedBy).toHaveLength(2)
  })

  test('the real committed locks reference at least one trackable issue', () => {
    const load = (rel: string) =>
      JSON.parse(readFileSync(resolve(import.meta.dir, '../../..', rel), 'utf8'))
    const refs = collectIssueRefs([
      { label: 'ui/compat.lock.json', data: load('ui/compat.lock.json') },
      { label: 'ui/support-matrix.lock.json', data: load('ui/support-matrix.lock.json') },
    ])
    expect(refs.length).toBeGreaterThan(0)
    for (const r of refs) expect(Number.isInteger(r.number)).toBe(true)
    // Regression guard for THIS change: the closed #2274 was re-pointed to
    // the open #2356, so no lock cell may still cite #2274.
    expect(refs.some((r) => r.number === 2274)).toBe(false)
  })
})

describe('formatStaleReport', () => {
  test('all-clear when nothing is stale', () => {
    expect(formatStaleReport([])).toContain('still open')
  })

  test('lists each closed issue with its citations', () => {
    const stale: StaleIssue[] = [
      {
        number: 2274,
        url: url(2274),
        citedBy: ['ui/compat.lock.json.components.foo.go.diagnostics[0].issues[0]'],
        state: 'closed',
        stateReason: 'completed',
        title: 'Date as the first catalogued rich type',
      },
    ]
    const out = formatStaleReport(stale)
    expect(out).toContain('#2274')
    expect(out).toContain('closed (completed)')
    expect(out).toContain('cited by:')
  })
})
