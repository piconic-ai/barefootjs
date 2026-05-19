// `bf init` is internal — the user-facing entry is
// `npm create barefootjs@latest`, which sets BAREFOOT_INIT_VIA_CREATE=1
// before spawning the CLI. This test pins that contract by running the
// raw CLI binary without the sentinel and asserting the redirect.
//
// We spawn the CLI rather than calling the run() function directly so
// the test exercises the same entry point a user would hit when
// typing `bf init` in their shell — including the env-var gate.

import { describe, test, expect } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const CLI_ENTRY = path.join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  'index.ts',
)

function mktmp(): string {
  return mkdtempSync(path.join(tmpdir(), 'bf-init-gate-test-'))
}

interface RunResult {
  exitCode: number | null
  stdout: string
  stderr: string
}

function runCli(args: string[], env: Record<string, string | undefined>): RunResult {
  // Strip the sentinel from inherited env so a parent test runner that
  // happened to set it can't accidentally let `bf init` through.
  const cleanEnv: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...process.env, ...env })) {
    if (v === undefined) continue
    if (k === 'BAREFOOT_INIT_VIA_CREATE') continue
    cleanEnv[k] = v
  }
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) cleanEnv[k] = v
  }
  const result = spawnSync('bun', [CLI_ENTRY, ...args], {
    env: cleanEnv,
    encoding: 'utf-8',
    cwd: mktmp(),
  })
  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

describe('bf init is internal — only create-barefootjs can invoke it', () => {
  test('direct `bf init` exits non-zero and points users at npm create', () => {
    const r = runCli(['init'], {})
    expect(r.exitCode).not.toBe(0)
    expect(r.stderr).toContain('`bf init` is internal')
    expect(r.stderr).toContain('npm create barefootjs@latest')
  })

  test('flags are not parsed before the gate fires (no half-init footgun)', () => {
    // A direct caller passing `--name foo --adapter hono` should still
    // be bounced. We assert via the redirect text rather than checking
    // for absence of side effects because the gate runs first thing
    // inside run() before any filesystem writes.
    const r = runCli(['init', '--name', 'foo', '--adapter', 'hono'], {})
    expect(r.exitCode).not.toBe(0)
    expect(r.stderr).toContain('`bf init` is internal')
  })

  test('gate passes when BAREFOOT_INIT_VIA_CREATE=1 is set (sanity)', () => {
    // We don't run a full init here — that would touch the network for
    // the registry probe. Instead we run inside a directory that already
    // has a barefoot.config.ts, which trips the next guard inside init
    // and exits with a different, init-specific error message. Hitting
    // that error proves the env-var gate let us through.
    const cwd = mktmp()
    writeFileSync(path.join(cwd, 'barefoot.config.ts'), 'export default {}')
    const result = spawnSync('bun', [CLI_ENTRY, 'init'], {
      env: { ...process.env, BAREFOOT_INIT_VIA_CREATE: '1' },
      encoding: 'utf-8',
      cwd,
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('barefoot.config.ts already exists')
    expect(result.stderr).not.toContain('`bf init` is internal')
  })
})
