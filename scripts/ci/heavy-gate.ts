#!/usr/bin/env bun
/**
 * Entry point of the `heavy-ci-ran` job (`.github/workflows/ci-heavy-gate.yml`).
 * The decision logic and its rationale are in `scripts/lib/heavy-gate.ts`.
 *
 * Env: GITHUB_TOKEN (actions: read), GITHUB_REPOSITORY, GITHUB_EVENT_PATH,
 * and optionally GITHUB_API_URL. It has no dependencies, so no `bun install`.
 */
import { readFileSync } from 'node:fs'
import { GATE_WORKFLOW_FILE, type GateRun, pollForVerdict } from '../lib/heavy-gate'

const env = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const event = JSON.parse(readFileSync(env('GITHUB_EVENT_PATH'), 'utf8'))
const action: string = event.action
const prNumber: number = event.pull_request.number
const headSha: string = event.pull_request.head.sha
const api = process.env.GITHUB_API_URL ?? 'https://api.github.com'

async function fetchRuns(): Promise<readonly GateRun[]> {
  const url = `${api}/repos/${env('GITHUB_REPOSITORY')}/actions/workflows/${GATE_WORKFLOW_FILE}/runs?head_sha=${headSha}&event=pull_request&per_page=100`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env('GITHUB_TOKEN')}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { workflow_runs: GateRun[] }
  return body.workflow_runs
}

// Up to ~2 minutes: 12 looks, 10s apart.
const verdict = await pollForVerdict({
  action,
  prNumber,
  fetchRuns,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts: 12,
  intervalMs: 10_000,
})

if (verdict.ok) {
  console.log(`PR #${prNumber} @ ${headSha} (${action}): ${verdict.reason}`)
} else {
  console.log(`::error title=Heavy CI missing::${verdict.reason}`)
  process.exit(1)
}
