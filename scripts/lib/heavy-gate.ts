/**
 * Decision logic and workflow lint for the heavy-CI gate
 * (`.github/workflows/ci-heavy-gate.yml`, job `heavy-ci-ran`).
 *
 * Policy (AGENTS.md, "CI on stacked PRs"): a stacked PR (base != main) runs
 * only the light set; the heavy set is `on: pull_request: branches: [main]`
 * with the default activity types (opened, synchronize, reopened). When a
 * stack's bottom PR merges, GitHub retargets the next PR onto main without a
 * push. No default type fires on that, so the heavy set never runs on that
 * head unless something is pushed. The gate makes this case loud.
 *
 * What the gate asserts: "a heavy-trigger event (opened / synchronize /
 * reopened) with base main has fired for this PR at this head SHA". That
 * event is exactly what starts every heavy workflow, with GitHub applying
 * each workflow's own `paths` filter to it. So the gate never re-implements
 * path filtering, and it never has to wait for heavy runs to be registered.
 *
 * - On a heavy-trigger event the answer is yes by construction: this very
 *   event started the heavy set.
 * - On `edited` (a title/body edit or a retarget), the gate looks for an
 *   earlier gate run on the same head SHA that was started by a heavy-trigger
 *   event for this PR. The gate's `run-name` records the PR number and the
 *   activity type, because the workflow-runs API does not expose the
 *   activity type any other way. Any run status counts, including cancelled,
 *   since the run's existence is what proves the event fired.
 *
 * The gate asserts that heavy CI *ran*, not that it passed. Heavy workflows
 * report their own results under their own check names. The gate never
 * posts a placeholder over them.
 *
 * GitHub's native stacked pull requests (#3480). A PR that belongs to a
 * GitHub stack is not filtered by its own base: every `pull_request`
 * workflow runs for every layer as if the PR targeted the stack's base (the
 * payload's `pull_request.stack.base.ref`), and checks out the stack applied
 * onto that base (a chain of merge refs down to `main`). When a PR joins a
 * stack, GitHub fires `pull_request` with the `stacked` action: the heavy
 * workflows, which keep the default activity types, run on it, but this
 * gate, whose `types` must be explicit to add `edited`, does not. So on a
 * natively stacked PR the gate can miss the very event that ran heavy CI
 * (#3471: red on its first `edited`, while #3470's heavy jobs had run on
 * `stacked`). A stack whose base is `main` therefore counts as evidence by
 * itself; a branch-based stack (base is a PR branch, no `stack` field) is
 * still filtered out by `branches: [main]` and handled as before.
 *
 * The evidence is also tied to the event's effective base (the stack base,
 * else the PR base): an event that does not target `main` is never taken as
 * proof that heavy CI ran against `main`.
 */

export const HEAVY_TRIGGER_ACTIONS = ['opened', 'synchronize', 'reopened'] as const

export const GATE_WORKFLOW_FILE = 'ci-heavy-gate.yml'
export const GATE_JOB = 'heavy-ci-ran'

/** Literal `run-name` of the gate workflow. The lint pins the YAML to this. */
export const GATE_RUN_NAME =
  'heavy-ci-gate #${{ github.event.pull_request.number }} ${{ github.event.action }}: ${{ github.event.pull_request.title }}'

export const MISSING_MESSAGE =
  'Heavy CI has not run on this head against main — push (e.g. merge main into this branch) to trigger it.'

/** The branch every heavy workflow filters on (`branches: [main]`). */
export const HEAVY_BASE = 'main'

export const notMainMessage = (base: string): string =>
  `This event targets ${base}, not ${HEAVY_BASE}, so it is no evidence that heavy CI ran against ${HEAVY_BASE}.`

/**
 * Workflows that run on every PR, stacked or not (the light set). Every other
 * workflow with a `pull_request` trigger must be main-only (`branches:
 * [main]`); the lint fails on a workflow that is neither. A new adapter's
 * `ci-<name>.yml` is heavy: give it `branches: [main]`, and do NOT add it here.
 */
export const EVERY_PR_WORKFLOWS: ReadonlySet<string> = new Set([
  // Split: light unit/IR jobs + heavy browser jobs gated by HEAVY_JOB_IF.
  'ci.yml',
  'ci-lint.yml',
  'ci-docs.yml',
  'ci-compat.yml',
  // Generated-artifact drift gates: ungated since #2780, and they must stay so.
  'update-fixtures.yml',
  'update-meta.yml',
  'update-doc-snapshots.yml',
  'update-api-reference.yml',
  'update-adapter-docs.yml',
  // The cognitive-complexity ratchet (#3427): seconds, so every PR.
  'ci-complexity.yml',
  // Opt-in by label (`cr-tracked`).
  'pkg-pr-new.yml',
])

/** `ci.yml` jobs in the light set. Every other `ci.yml` job carries HEAVY_JOB_IF. */
export const CI_YML_LIGHT_JOBS: ReadonlySet<string> = new Set(['test', 'test-ui'])
export const HEAVY_JOB_IF = "github.event_name != 'pull_request' || github.base_ref == 'main'"

export interface GateRun {
  display_title: string
}

export type GateVerdict = { ok: boolean; reason: string }

/**
 * What the gate knows about the event, besides the runs it fetches.
 * `baseRef` is `pull_request.base.ref`; `stackBaseRef` is
 * `pull_request.stack.base.ref`, present only when the PR is in a GitHub
 * stack.
 */
export interface GateEvent {
  action: string
  prNumber: number
  baseRef: string
  stackBaseRef?: string | null
}

const isHeavyTrigger = (action: string): boolean =>
  (HEAVY_TRIGGER_ACTIONS as readonly string[]).includes(action)

/** Parses a gate run's `display_title` (its evaluated GATE_RUN_NAME). */
export function parseGateRunTitle(displayTitle: string): { pr: number; action: string } | null {
  const [, pr, action] = /^heavy-ci-gate #(\d+) ([a-z_]+): /.exec(displayTitle) ?? []
  return pr && action ? { pr: Number(pr), action } : null
}

/**
 * `runs`: this workflow's `pull_request` runs on the PR's head SHA. The
 * current run is among them, which is harmless because its action is `edited`.
 */
export function decide(input: GateEvent & { runs: readonly GateRun[] }): GateVerdict {
  const base = input.stackBaseRef || input.baseRef
  if (base !== HEAVY_BASE) return { ok: false, reason: notMainMessage(base) }
  if (isHeavyTrigger(input.action)) {
    return { ok: true, reason: `this ${input.action} event (base ${base}) is itself the heavy-CI trigger` }
  }
  if (input.stackBaseRef === HEAVY_BASE) {
    return {
      ok: true,
      reason:
        `this PR is in a GitHub stack based on ${HEAVY_BASE}: the heavy set ran for this layer against the stack ` +
        "when it joined the stack (the `stacked` action) or on its last push, both of which every heavy workflow fires on",
    }
  }
  const evidence = input.runs
    .map((run) => parseGateRunTitle(run.display_title))
    .find((parsed) => parsed !== null && parsed.pr === input.prNumber && isHeavyTrigger(parsed.action))
  return evidence
    ? { ok: true, reason: `heavy CI was triggered on this head by a ${evidence.action} event with base main` }
    : { ok: false, reason: MISSING_MESSAGE }
}

/**
 * Re-evaluates `decide` until it passes or `attempts` run out. This covers
 * the short window where an `edited` event is processed before the gate run
 * of a just-pushed `synchronize` is registered.
 */
export async function pollForVerdict(opts: GateEvent & {
  fetchRuns: () => Promise<readonly GateRun[]>
  sleep: (ms: number) => Promise<void>
  attempts: number
  intervalMs: number
}): Promise<GateVerdict> {
  const event: GateEvent = {
    action: opts.action,
    prNumber: opts.prNumber,
    baseRef: opts.baseRef,
    stackBaseRef: opts.stackBaseRef,
  }
  // Decided without the runs: the event itself is the answer (a heavy
  // trigger, a stack based on main, or a base that is not main).
  const immediate = decide({ ...event, runs: [] })
  if (immediate.ok || immediate.reason !== MISSING_MESSAGE) return immediate
  let verdict: GateVerdict = immediate
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    verdict = decide({ ...event, runs: await opts.fetchRuns() })
    if (verdict.ok || attempt === opts.attempts) break
    await opts.sleep(opts.intervalMs)
  }
  return verdict
}

// ---------------------------------------------------------------------------
// Workflow lint: keeps the gate's premise true as workflows are added.
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>
const asObj = (value: unknown): Obj | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : undefined

/** The `pull_request` trigger config: undefined when absent, {} when bare. */
function pullRequestTrigger(workflow: Obj): Obj | undefined {
  const on = workflow.on
  if (on === 'pull_request') return {}
  if (Array.isArray(on)) return on.includes('pull_request') ? {} : undefined
  const triggers = asObj(on)
  if (!triggers || !('pull_request' in triggers)) return undefined
  return asObj(triggers.pull_request) ?? {}
}

const sameSet = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((item) => b.includes(item))

/** Returns one message per violation; an empty list means the policy holds. */
export function lintWorkflows(workflows: ReadonlyMap<string, unknown>): string[] {
  const problems: string[] = []

  for (const [file, raw] of workflows) {
    const workflow = asObj(raw) ?? {}
    const trigger = pullRequestTrigger(workflow)
    if (!trigger || file === GATE_WORKFLOW_FILE) continue
    const branches = trigger.branches
    const types = trigger.types as unknown[] | undefined
    const mainOnly = Array.isArray(branches) && sameSet(branches, ['main'])
    if (mainOnly) {
      if (EVERY_PR_WORKFLOWS.has(file)) {
        problems.push(`${file}: listed in EVERY_PR_WORKFLOWS but its pull_request trigger is main-only`)
      }
      if (types && !HEAVY_TRIGGER_ACTIONS.every((action) => types.includes(action))) {
        problems.push(`${file}: a main-only workflow must fire on ${HEAVY_TRIGGER_ACTIONS.join(', ')} (the gate treats those events as proof it ran)`)
      }
      if (types?.includes('edited')) {
        problems.push(`${file}: a main-only workflow must not list \`edited\`; ${GATE_WORKFLOW_FILE} covers retargeting`)
      }
    } else if (branches !== undefined || trigger['branches-ignore'] !== undefined) {
      problems.push(`${file}: pull_request branch filter must be exactly \`branches: [main]\` or absent`)
    } else if (!EVERY_PR_WORKFLOWS.has(file)) {
      problems.push(
        `${file}: runs on every PR, stacked ones included. Add \`branches: [main]\` to its pull_request trigger (heavy set), or list it in EVERY_PR_WORKFLOWS (light set)`,
      )
    }
  }

  const ci = asObj(workflows.get('ci.yml'))
  for (const [job, raw] of Object.entries(asObj(ci?.jobs) ?? {})) {
    const condition = asObj(raw)?.if
    if (CI_YML_LIGHT_JOBS.has(job)) {
      if (condition !== undefined) problems.push(`ci.yml: light job \`${job}\` must not have a job-level if`)
    } else if (condition !== HEAVY_JOB_IF) {
      problems.push(`ci.yml: heavy job \`${job}\` needs \`if: ${HEAVY_JOB_IF}\` (or list it in CI_YML_LIGHT_JOBS)`)
    }
  }

  const gate = asObj(workflows.get(GATE_WORKFLOW_FILE))
  if (!gate) {
    problems.push(`${GATE_WORKFLOW_FILE}: missing`)
    return problems
  }
  const gateTrigger = pullRequestTrigger(gate) ?? {}
  if (!Array.isArray(gateTrigger.branches) || !sameSet(gateTrigger.branches, ['main'])) {
    problems.push(`${GATE_WORKFLOW_FILE}: pull_request trigger needs \`branches: [main]\``)
  }
  if (!Array.isArray(gateTrigger.types) || !sameSet(gateTrigger.types, [...HEAVY_TRIGGER_ACTIONS, 'edited'])) {
    problems.push(`${GATE_WORKFLOW_FILE}: pull_request types must be exactly ${[...HEAVY_TRIGGER_ACTIONS, 'edited'].join(', ')}`)
  }
  if (gate['run-name'] !== GATE_RUN_NAME) {
    problems.push(`${GATE_WORKFLOW_FILE}: run-name must be exactly GATE_RUN_NAME (parseGateRunTitle reads it)`)
  }
  const gateJob = asObj(asObj(gate.jobs)?.[GATE_JOB])
  if (!gateJob) problems.push(`${GATE_WORKFLOW_FILE}: job \`${GATE_JOB}\` missing`)
  else if (gateJob.if !== undefined) {
    problems.push(`${GATE_WORKFLOW_FILE}: \`${GATE_JOB}\` must not have a job-level if (a skipped run would read as success)`)
  }
  const group = asObj(gate.concurrency)?.group
  if (typeof group !== 'string' || !group.startsWith('ci-heavy-gate-')) {
    problems.push(`${GATE_WORKFLOW_FILE}: concurrency group must be its own (ci-heavy-gate-…), never shared with a heavy workflow`)
  }
  return problems
}
