#!/usr/bin/env bun
/**
 * Entry point of a scheduled sweep's `report` job: posts the run's outcome to
 * the sweep's tracking issue. Policy and rendering are in
 * `scripts/lib/nightly-report.ts`.
 *
 * Env: GITHUB_TOKEN (issues: write, actions: read), GITHUB_REPOSITORY,
 * GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, GITHUB_SHA, GITHUB_WORKFLOW,
 * GITHUB_WORKFLOW_REF, GITHUB_SERVER_URL, optionally GITHUB_API_URL,
 * NIGHTLY_REPORT_MENTION (e.g. `@kfly8`) and REPORTER_JOB (default
 * `report`, the job to leave out of the verdict). It has no dependencies,
 * so no `bun install`.
 *
 * `--dry-run` prints the comment and the planned issue changes without
 * writing anything.
 */
import {
  NIGHTLY_LABEL,
  type RunJob,
  issueBody,
  issueTitle,
  renderComment,
  summarize,
  transition,
} from '../lib/nightly-report'

const env = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const dryRun = process.argv.includes('--dry-run')
const api = process.env.GITHUB_API_URL ?? 'https://api.github.com'
const repo = env('GITHUB_REPOSITORY')
const workflowName = env('GITHUB_WORKFLOW')
// `owner/repo/.github/workflows/<file>@<ref>`
const workflowFile = env('GITHUB_WORKFLOW_REF').split('@')[0].split('/').pop() ?? ''

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${api}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${await res.text()}`)
  return (res.status === 204 ? undefined : await res.json()) as T
}

async function write<T>(method: string, path: string, body: unknown): Promise<T | undefined> {
  if (dryRun) {
    console.log(`[dry-run] ${method} ${path}`)
    return undefined
  }
  return call<T>(method, path, body)
}

const runId = env('GITHUB_RUN_ID')
const attempt = process.env.GITHUB_RUN_ATTEMPT ?? '1'
const { jobs } = await call<{ jobs: RunJob[] }>(
  'GET',
  `/repos/${repo}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`,
)
const { ok, jobs: measured } = summarize(jobs, process.env.REPORTER_JOB ?? 'report')

const comment = renderComment({
  workflowName,
  ok,
  jobs: measured,
  runUrl: `${env('GITHUB_SERVER_URL')}/${repo}/actions/runs/${runId}`,
  sha: env('GITHUB_SHA'),
  date: new Date().toISOString().slice(0, 10),
  mention: process.env.NIGHTLY_REPORT_MENTION || undefined,
})
console.log(comment)

interface Issue {
  number: number
  title: string
  state: 'open' | 'closed'
  pull_request?: unknown
}

const title = issueTitle(workflowName)
const candidates = await call<Issue[]>(
  'GET',
  `/repos/${repo}/issues?labels=${NIGHTLY_LABEL}&state=all&sort=created&direction=asc&per_page=100`,
)
let issue = candidates.find((candidate) => !candidate.pull_request && candidate.title === title)

if (!issue) {
  // Creating an issue with a label that does not exist yet fails, so make
  // sure it exists first. 422 means it already does.
  if (!dryRun) {
    await call('POST', `/repos/${repo}/labels`, {
      name: NIGHTLY_LABEL,
      color: 'b60205',
      description: 'Tracking issue of a scheduled sweep (scripts/ci/nightly-report.ts)',
    }).catch((err: Error) => {
      if (!err.message.includes('-> 422')) throw err
    })
  }
  issue = await write<Issue>('POST', `/repos/${repo}/issues`, {
    title,
    body: issueBody(workflowName, workflowFile),
    labels: [NIGHTLY_LABEL],
  })
  if (issue) console.log(`Created #${issue.number} "${title}"`)
}

const number = issue?.number ?? 0
const change = transition(issue?.state ?? 'open', ok)
if (change === 'reopen') await write('PATCH', `/repos/${repo}/issues/${number}`, { state: 'open' })
await write('POST', `/repos/${repo}/issues/${number}/comments`, { body: comment })
if (change === 'close') {
  await write('PATCH', `/repos/${repo}/issues/${number}`, { state: 'closed', state_reason: 'completed' })
}
const outcome = { reopen: 'reopened', close: 'closed', none: 'left as is' }[change]
console.log(`#${number}: ${ok ? 'passed' : 'failed'}, issue ${outcome}`)
