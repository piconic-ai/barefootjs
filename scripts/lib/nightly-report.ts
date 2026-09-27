/**
 * Reporting for scheduled sweeps (`explore-sweep.yml`'s `report` job).
 *
 * A scheduled workflow that fails notifies only the account that last
 * edited its cron, and only by the notification settings it happens to
 * have. The explore sweep was red for three nights in a row before anyone
 * looked. So each run of a sweep posts its outcome to one tracking issue
 * per workflow (`Nightly: <workflow name>`, label `nightly-sweep`):
 *
 * - every run adds a comment (the per-job results, the commit, a link), so
 *   anyone subscribed to the issue hears about success and failure alike;
 * - a failing run reopens the issue, a passing run closes it, so the
 *   issue's open/closed state is the sweep's current state at a glance.
 *
 * This module is the decision and rendering logic; the network calls are in
 * `scripts/ci/nightly-report.ts`.
 */

export const NIGHTLY_LABEL = 'nightly-sweep'

export function issueTitle(workflowName: string): string {
  return `Nightly: ${workflowName}`
}

/** One job of the run being reported, as the workflow-run jobs API lists it. */
export interface RunJob {
  name: string
  status: string
  conclusion: string | null
  html_url: string
}

/**
 * The run passed when every job other than the reporter itself concluded
 * `success` or `skipped`. A cancelled or timed-out job is a failure: the
 * sweep did not measure what it exists to measure.
 */
export function summarize(jobs: readonly RunJob[], reporterJob: string): { ok: boolean; jobs: RunJob[] } {
  const measured = jobs.filter((job) => job.name !== reporterJob)
  const ok = measured.length > 0 && measured.every((job) => job.conclusion === 'success' || job.conclusion === 'skipped')
  return { ok, jobs: measured }
}

const ICON: Record<string, string> = {
  success: '✅',
  skipped: '⏭️',
  failure: '❌',
  cancelled: '🚫',
  timed_out: '⏱️',
}

export interface CommentInput {
  workflowName: string
  ok: boolean
  jobs: readonly RunJob[]
  runUrl: string
  sha: string
  /** `YYYY-MM-DD` of the run. */
  date: string
  /** Optional `@user` / `@org/team` line, from the `NIGHTLY_REPORT_MENTION` repository variable. */
  mention?: string
}

export function renderComment(input: CommentInput): string {
  const verdict = input.ok ? '✅ passed' : '❌ failed'
  const rows = input.jobs.map((job) => {
    const conclusion = job.conclusion ?? job.status
    return `| [${job.name}](${job.html_url}) | ${ICON[conclusion] ?? '❔'} ${conclusion} |`
  })
  return [
    `### ${input.workflowName} ${verdict} — ${input.date}`,
    '',
    `Commit \`${input.sha.slice(0, 9)}\` · [workflow run](${input.runUrl})`,
    '',
    '| Job | Result |',
    '|---|---|',
    ...rows,
    ...(input.mention ? ['', input.mention] : []),
  ].join('\n')
}

export function issueBody(workflowName: string, workflowFile: string): string {
  return [
    `Status of the scheduled **${workflowName}** (\`.github/workflows/${workflowFile}\`).`,
    '',
    'Every scheduled run comments its result here. A failing run reopens this issue and a passing run closes it,',
    'so the issue is open exactly while the sweep is red. Subscribe to this issue to be notified of every run.',
    '',
    'Maintained by `scripts/ci/nightly-report.ts`; do not rename it (the reporter finds it by title).',
  ].join('\n')
}

export type IssueTransition = 'reopen' | 'close' | 'none'

export function transition(issueState: 'open' | 'closed', ok: boolean): IssueTransition {
  if (!ok && issueState === 'closed') return 'reopen'
  if (ok && issueState === 'open') return 'close'
  return 'none'
}
