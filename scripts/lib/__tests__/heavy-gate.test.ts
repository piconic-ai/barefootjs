import { describe, test, expect } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  GATE_RUN_NAME,
  GATE_WORKFLOW_FILE,
  MISSING_MESSAGE,
  decide,
  lintWorkflows,
  parseGateRunTitle,
  pollForVerdict,
} from '../heavy-gate'

// What GitHub renders GATE_RUN_NAME to, for a given PR / activity type / title.
const title = (pr: number, action: string, prTitle = 'Some PR: with a colon') =>
  GATE_RUN_NAME.replace('${{ github.event.pull_request.number }}', String(pr))
    .replace('${{ github.event.action }}', action)
    .replace('${{ github.event.pull_request.title }}', prTitle)

describe('parseGateRunTitle', () => {
  test('reads the PR number and activity type back out of the rendered run-name', () => {
    expect(parseGateRunTitle(title(3202, 'synchronize'))).toEqual({ pr: 3202, action: 'synchronize' })
  })

  test('ignores titles that are not gate run-names', () => {
    expect(parseGateRunTitle('heavy-ci-gate: #12 opened')).toBeNull()
    expect(parseGateRunTitle('Fix the thing')).toBeNull()
  })
})

describe('decide', () => {
  test.each(['opened', 'synchronize', 'reopened'])('a %s event is itself the heavy trigger', (action) => {
    expect(decide({ action, prNumber: 1, runs: [] }).ok).toBe(true)
  })

  test('retarget with no push: only edited runs on this head, so it fails with the push instruction', () => {
    const verdict = decide({ action: 'edited', prNumber: 7, runs: [{ display_title: title(7, 'edited') }] })
    expect(verdict).toEqual({ ok: false, reason: MISSING_MESSAGE })
  })

  test('a title/body edit after heavy CI ran re-derives the same pass', () => {
    const runs = [{ display_title: title(7, 'edited') }, { display_title: title(7, 'synchronize') }]
    expect(decide({ action: 'edited', prNumber: 7, runs }).ok).toBe(true)
  })

  test("another PR's heavy trigger on the same SHA is not evidence for this PR", () => {
    expect(decide({ action: 'edited', prNumber: 7, runs: [{ display_title: title(8, 'opened') }] }).ok).toBe(false)
  })

  test('the gate stays red across repeated no-op edits until a heavy trigger lands', () => {
    const runs = [{ display_title: title(7, 'edited') }, { display_title: title(7, 'edited') }]
    expect(decide({ action: 'edited', prNumber: 7, runs }).ok).toBe(false)
  })
})

describe('pollForVerdict', () => {
  const noSleep = async () => {}

  test('does not call the API on a heavy-trigger event', async () => {
    let calls = 0
    const verdict = await pollForVerdict({
      action: 'synchronize',
      prNumber: 1,
      fetchRuns: async () => (calls++, []),
      sleep: noSleep,
      attempts: 3,
      intervalMs: 0,
    })
    expect(verdict.ok).toBe(true)
    expect(calls).toBe(0)
  })

  test('picks up a gate run that registers late', async () => {
    let calls = 0
    const verdict = await pollForVerdict({
      action: 'edited',
      prNumber: 5,
      fetchRuns: async () => (++calls < 3 ? [] : [{ display_title: title(5, 'synchronize') }]),
      sleep: noSleep,
      attempts: 12,
      intervalMs: 0,
    })
    expect(verdict.ok).toBe(true)
    expect(calls).toBe(3)
  })

  test('gives up after the bounded number of attempts', async () => {
    let calls = 0
    const verdict = await pollForVerdict({
      action: 'edited',
      prNumber: 5,
      fetchRuns: async () => (calls++, []),
      sleep: noSleep,
      attempts: 4,
      intervalMs: 0,
    })
    expect(verdict.ok).toBe(false)
    expect(calls).toBe(4)
  })
})

describe('lintWorkflows', () => {
  const workflowsDir = join(import.meta.dir, '..', '..', '..', '.github', 'workflows')
  const real = new Map<string, unknown>(
    readdirSync(workflowsDir)
      .filter((file) => file.endsWith('.yml'))
      .map((file) => [file, Bun.YAML.parse(readFileSync(join(workflowsDir, file), 'utf8'))]),
  )

  test('the checked-in workflows satisfy the stacked-PR policy', () => {
    expect(lintWorkflows(real)).toEqual([])
  })

  test('a new workflow with an unfiltered pull_request trigger must be classified', () => {
    const workflows = new Map(real)
    workflows.set('ci-newlang.yml', { on: { pull_request: { paths: ['packages/adapter-newlang/**'] } } })
    expect(lintWorkflows(workflows)).toEqual([expect.stringContaining('ci-newlang.yml: runs on every PR')])
  })

  test('a heavy workflow may not add `edited`', () => {
    const workflows = new Map(real)
    workflows.set('ci-newlang.yml', {
      on: { pull_request: { branches: ['main'], types: ['opened', 'synchronize', 'reopened', 'edited'] } },
    })
    expect(lintWorkflows(workflows)).toEqual([expect.stringContaining('must not list `edited`')])
  })

  test('a heavy workflow must fire on every heavy-trigger action', () => {
    const workflows = new Map(real)
    workflows.set('ci-newlang.yml', { on: { pull_request: { branches: ['main'], types: ['opened'] } } })
    expect(lintWorkflows(workflows)).toEqual([expect.stringContaining('must fire on opened, synchronize, reopened')])
  })

  test('the gate job may not be skippable', () => {
    const workflows = new Map(real)
    const gate = structuredClone(real.get(GATE_WORKFLOW_FILE)) as { jobs: Record<string, { if?: string }> }
    gate.jobs['heavy-ci-ran']!.if = "github.event.action != 'edited'"
    workflows.set(GATE_WORKFLOW_FILE, gate)
    expect(lintWorkflows(workflows)).toEqual([expect.stringContaining('must not have a job-level if')])
  })
})
