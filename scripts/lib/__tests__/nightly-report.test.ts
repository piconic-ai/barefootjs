import { describe, expect, test } from 'bun:test'
import { type RunJob, issueTitle, renderComment, summarize, transition } from '../nightly-report'

const job = (name: string, conclusion: string | null, status = 'completed'): RunJob => ({
  name,
  status,
  conclusion,
  html_url: `https://example.test/${encodeURIComponent(name)}`,
})

describe('summarize', () => {
  test('passes when every measured job succeeded or was skipped', () => {
    const result = summarize(
      [job('explore-sweep', 'success'), job('explore-sweep-adapter (go-template)', 'skipped'), job('report', null, 'in_progress')],
      'report',
    )
    expect(result.ok).toBe(true)
    expect(result.jobs.map((j) => j.name)).toEqual(['explore-sweep', 'explore-sweep-adapter (go-template)'])
  })

  test('fails on a failed, cancelled or timed-out job', () => {
    for (const conclusion of ['failure', 'cancelled', 'timed_out']) {
      expect(summarize([job('a', 'success'), job('b', conclusion)], 'report').ok).toBe(false)
    }
  })

  test('the reporter job never counts, even while it is still running', () => {
    expect(summarize([job('a', 'success'), job('report', null, 'in_progress')], 'report').ok).toBe(true)
  })

  test('a run with no measured jobs is not a pass', () => {
    expect(summarize([job('report', null, 'in_progress')], 'report').ok).toBe(false)
  })
})

describe('transition', () => {
  test('a failure reopens a closed issue and leaves an open one open', () => {
    expect(transition('closed', false)).toBe('reopen')
    expect(transition('open', false)).toBe('none')
  })

  test('a pass closes an open issue and leaves a closed one closed', () => {
    expect(transition('open', true)).toBe('close')
    expect(transition('closed', true)).toBe('none')
  })
})

describe('renderComment', () => {
  const input = {
    workflowName: 'Explore Sweep',
    jobs: [job('explore-sweep', 'success'), job('explore-sweep-adapter (go-template)', 'failure')],
    runUrl: 'https://github.com/o/r/actions/runs/1',
    sha: '94bfd7a61a606420aba7fbc1ae6bb730fed8785d',
    date: '2026-09-27',
  }

  test('states the verdict, the commit and one row per job', () => {
    const body = renderComment({ ...input, ok: false })
    expect(body).toContain('### Explore Sweep ❌ failed — 2026-09-27')
    expect(body).toContain('Commit `94bfd7a61`')
    expect(body).toContain('[workflow run](https://github.com/o/r/actions/runs/1)')
    expect(body).toContain('| ✅ success |')
    expect(body).toContain('| ❌ failure |')
  })

  test('appends the mention only when one is configured', () => {
    expect(renderComment({ ...input, ok: true, mention: '@kfly8' }).endsWith('\n\n@kfly8')).toBe(true)
    expect(renderComment({ ...input, ok: true })).not.toContain('@')
  })
})

test('issueTitle is what the reporter looks the issue up by', () => {
  expect(issueTitle('Explore Sweep')).toBe('Nightly: Explore Sweep')
})
