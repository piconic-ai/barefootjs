// `bf debug profile` mode flags and error surfaces. We spawn the CLI so the
// behavior is exercised exactly as a user hits it — these paths fire before any
// run, so no built client runtime is required. Covers:
//   - B4: `--scenario` + `--diff` are mutually exclusive
//   - B8: git's stderr doesn't leak ahead of the CLI error on a bad --diff ref

import { describe, test, expect } from 'bun:test'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI_ENTRY = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', 'index.ts')

function runCli(args: string[]): { exitCode: number | null; stderr: string } {
  const r = spawnSync('bun', [CLI_ENTRY, ...args], {
    encoding: 'utf-8',
    cwd: path.join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..'),
  })
  return { exitCode: r.status, stderr: r.stderr }
}

describe('bf debug profile — --scenario + --diff are mutually exclusive (#1849 B4)', () => {
  test('combining them exits non-zero with an explanatory error', () => {
    const r = runCli(['debug', 'profile', 'button', '--scenario', 'auto', '--diff', 'HEAD~1'])
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain('--scenario and --diff cannot be combined')
  })
})

describe('bf debug profile — git stderr does not leak on a bad --diff ref (#1849 B8)', () => {
  test('git diagnostics fold into the CLI error, no raw "fatal:" line leaks', () => {
    const r = runCli(['debug', 'profile', 'button', '--diff', 'nonexistent-ref'])
    expect(r.exitCode).toBe(1)
    // Our message explains the failure and incorporates git's own text.
    expect(r.stderr).toContain('Cannot read')
    expect(r.stderr).toContain('invalid object name')
    // git's raw stderr must not appear on its own line ahead of ours.
    const leaked = r.stderr.split('\n').some(line => line.startsWith('fatal:'))
    expect(leaked).toBe(false)
  })
})
