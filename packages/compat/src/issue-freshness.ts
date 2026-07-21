// @barefootjs/compat — issue-link freshness.
//
// The compatibility-matrix page (site/core/pages/compat-matrix.tsx) links
// every diagnostic / gap / render-divergence cell to the GitHub issue that
// tracks it. Those URLs come from each adapter's `conformance-pins.ts` and
// `render-divergences.ts` and are baked into the committed lock files
// (`ui/compat.lock.json`, `ui/support-matrix.lock.json`).
//
// The `ci-compat` drift gate proves the locks MATCH the code — it does NOT
// prove the referenced issues are still OPEN. When a tracking issue is
// closed (resolved, or superseded by a new tracker) but the pin keeps
// pointing at it, the published matrix silently links a live limitation to
// a completed ticket and reads as stale. Nothing caught that until a human
// noticed. This module is the missing detector: it collects every issue URL
// the locks reference so a scheduled job can check their open/closed state
// against GitHub (see `issue-freshness-cli.ts` + the `compat-issue-freshness`
// workflow).
//
// This half is deliberately pure (no network): it walks the parsed lock
// JSON and returns the referenced issue numbers with the lock paths that
// cite them. The GitHub query and alerting live in the CLI so this stays
// unit-testable offline.

/** The canonical repo whose issues the matrix links to. */
export const REPO_SLUG = 'piconic-ai/barefootjs'

/** Escape regex metacharacters so `REPO_SLUG` is matched literally. */
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Global + capture-group: `matchAll` collects EVERY issue URL in a string
// (not just the first), and the unanchored number capture tolerates any
// trailing `/`, `#fragment`, or `?query` suffix — a staleness detector must
// never silently miss a referenced issue.
const ISSUE_URL_RE = new RegExp(
  `https://github\\.com/${escapeRegExp(REPO_SLUG)}/issues/(\\d+)`,
  'g',
)

/** One referenced issue plus every lock-JSON path that cites it. */
export interface IssueRef {
  number: number
  url: string
  /** Dotted JSON paths (e.g. `compat.fixtureDivergences.fixtures.date-method-uncatalogued.hono.issues[0]`). */
  citedBy: string[]
}

/**
 * Walk an already-parsed lock object and collect every GitHub issue URL it
 * references, keyed by issue number, each with the JSON paths that cite it.
 * Shape-agnostic on purpose: a generic recursive walk survives lock-schema
 * changes (new sections, renamed cells) that a hardcoded field list would
 * silently stop covering. `label` prefixes the path so a multi-lock caller
 * can tell which file a citation came from.
 */
export function collectIssueRefsFromLock(
  lock: unknown,
  label: string,
  acc: Map<number, IssueRef> = new Map(),
): Map<number, IssueRef> {
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      for (const m of node.matchAll(ISSUE_URL_RE)) {
        const number = Number(m[1])
        const existing = acc.get(number)
        if (existing) {
          existing.citedBy.push(path)
        } else {
          acc.set(number, { number, url: m[0], citedBy: [path] })
        }
      }
      return
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`))
      return
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        walk(value, path ? `${path}.${key}` : key)
      }
    }
  }
  walk(lock, label)
  return acc
}

/**
 * Merge the issue references across several parsed locks into one sorted
 * list (ascending issue number), deduped by number with citations pooled.
 */
export function collectIssueRefs(locks: { label: string; data: unknown }[]): IssueRef[] {
  const acc = new Map<number, IssueRef>()
  for (const { label, data } of locks) collectIssueRefsFromLock(data, label, acc)
  return [...acc.values()].sort((a, b) => a.number - b.number)
}

/** A referenced issue that GitHub reports as no longer open. */
export interface StaleIssue extends IssueRef {
  state: 'closed'
  stateReason: string | null
  title: string
}

/**
 * Render the human-readable staleness report shared by the CLI's stdout and
 * the workflow's alert-issue body (kept in one place so both read the same).
 * `stale` empty → an all-clear line.
 */
export function formatStaleReport(stale: StaleIssue[]): string {
  if (stale.length === 0) {
    return 'All issue links referenced by the compatibility matrix are still open. ✓'
  }
  const lines = stale.map((s) => {
    const reason = s.stateReason ? ` (${s.stateReason})` : ''
    const cites = s.citedBy.map((c) => `\`${c}\``).join(', ')
    return `- [#${s.number}](${s.url}) — **closed${reason}** — “${s.title}”\n  - cited by: ${cites}`
  })
  return [
    `${stale.length} issue link(s) referenced by the compatibility matrix point at a CLOSED issue.`,
    '',
    'Each needs a human decision: the limitation was resolved (remove the pin) or the tracker was superseded (re-point the pin to an open issue), then regenerate the locks (`bun run compat:lock && bun run support-matrix:lock`).',
    '',
    ...lines,
  ].join('\n')
}
