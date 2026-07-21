#!/usr/bin/env node
// @barefootjs/compat — issue-link freshness checker (network half).
//
// Collects every GitHub issue URL the committed lock files reference (see
// `issue-freshness.ts`), asks GitHub whether each is still open, and reports
// the closed ones. A tracking issue that has been closed but is still pinned
// means the compatibility-matrix page links a live limitation to a completed
// ticket — the exact staleness the `ci-compat` drift gate cannot see.
//
// Invocation:
//   bun run packages/compat/src/issue-freshness-cli.ts [--fail-on-stale] [--report-file <path>]
//   (or via the root `compat:issues` script)
//
// Auth: uses `GITHUB_TOKEN` when present (required in CI for rate limits);
// falls back to unauthenticated requests locally. Runs on a schedule via
// `.github/workflows/compat-issue-freshness.yml`, which turns any staleness
// into an alert issue for a human to resolve.

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  REPO_SLUG,
  collectIssueRefs,
  formatStaleReport,
  type IssueRef,
  type StaleIssue,
} from './issue-freshness'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const LOCKS = [
  { label: 'ui/compat.lock.json', file: 'ui/compat.lock.json' },
  { label: 'ui/support-matrix.lock.json', file: 'ui/support-matrix.lock.json' },
]

interface IssueState {
  state: 'open' | 'closed'
  stateReason: string | null
  title: string
}

async function fetchIssueState(number: number): Promise<IssueState> {
  const token = process.env.GITHUB_TOKEN
  const res = await fetch(`https://api.github.com/repos/${REPO_SLUG}/issues/${number}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'barefootjs-compat-issue-freshness',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for issue #${number}: ${await res.text()}`)
  }
  const body = (await res.json()) as {
    state: 'open' | 'closed'
    state_reason: string | null
    title: string
  }
  return { state: body.state, stateReason: body.state_reason, title: body.title }
}

function parseArgs(argv: string[]): { failOnStale: boolean; reportFile?: string } {
  const failOnStale = argv.includes('--fail-on-stale')
  const idx = argv.indexOf('--report-file')
  const reportFile = idx >= 0 ? argv[idx + 1] : undefined
  return { failOnStale, reportFile }
}

async function main(): Promise<void> {
  const { failOnStale, reportFile } = parseArgs(process.argv.slice(2))

  const locks = LOCKS.map(({ label, file }) => ({
    label,
    data: JSON.parse(readFileSync(path.join(REPO_ROOT, file), 'utf8')) as unknown,
  }))
  const refs: IssueRef[] = collectIssueRefs(locks)
  console.error(`Checking ${refs.length} referenced issue(s) against GitHub…`)

  const stale: StaleIssue[] = []
  for (const ref of refs) {
    const state = await fetchIssueState(ref.number)
    const status = state.state === 'open' ? 'open' : `CLOSED${state.stateReason ? ` (${state.stateReason})` : ''}`
    console.error(`  #${ref.number} — ${status} — ${state.title}`)
    if (state.state === 'closed') {
      stale.push({ ...ref, state: 'closed', stateReason: state.stateReason, title: state.title })
    }
  }

  const report = formatStaleReport(stale)
  console.log(report)
  if (reportFile) writeFileSync(reportFile, report)

  // Surface a boolean for the workflow without relying on exit code, so the
  // scheduled run can open an alert issue instead of just failing red.
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `stale=${stale.length > 0}\n`)
    appendFileSync(process.env.GITHUB_OUTPUT, `count=${stale.length}\n`)
  }

  if (stale.length > 0 && failOnStale) process.exit(1)
}

if (import.meta.main) {
  await main()
}
