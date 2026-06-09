// `bf debug profile` mode flags. `--scenario` (measure a run) and `--diff`
// (compare two compiles) are mutually exclusive; combining them used to
// silently run the scenario and drop `--diff` (#1849 B4). We spawn the CLI so
// the guard is exercised exactly as a user hits it — and the check fires before
// any run, so no built client runtime is required.

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
