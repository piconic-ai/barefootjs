// Coverage for the adapter-discovery papercuts fixed in #2122:
//   - `--list-adapters` (offline, works even inside an already-
//     initialized project directory)
//   - targeted language-alias hints for `--adapter go`/`perl`/...
//   - non-interactive "✔ ..." confirmation lines when the adapter/css
//     choice is resolved via flag rather than the interactive picker
//
// All scenarios here are failing-fast or `--css none` paths, so none
// of them reach the registry probe in `run()` — safe to run offline,
// same rationale `init-gate.test.ts` documents for the gate checks.

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
  return mkdtempSync(path.join(tmpdir(), 'bf-init-flags-test-'))
}

interface RunResult {
  exitCode: number | null
  stdout: string
  stderr: string
}

function runInit(args: string[], cwd: string): RunResult {
  const result = spawnSync('bun', [CLI_ENTRY, 'init', ...args], {
    env: { ...process.env, BAREFOOT_INIT_VIA_CREATE: '1' },
    encoding: 'utf-8',
    cwd,
  })
  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

describe('bf init --list-adapters', () => {
  test('prints every adapter id + the CSS library options and exits 0', () => {
    const r = runInit(['--list-adapters'], mktmp())
    expect(r.exitCode).toBe(0)
    for (const id of ['hono', 'hono-node', 'echo', 'gin', 'chi', 'nethttp', 'mojo', 'xslate', 'csr']) {
      expect(r.stdout).toContain(id)
    }
    expect(r.stdout).toContain('unocss')
    expect(r.stdout).toContain('none')
  })

  test('works even when barefoot.config.ts already exists (handled before that guard)', () => {
    const cwd = mktmp()
    writeFileSync(path.join(cwd, 'barefoot.config.ts'), 'export default {}')
    const r = runInit(['--list-adapters'], cwd)
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('hono')
    expect(r.stderr).not.toContain('already exists')
  })
})

describe('bf init --adapter <unknown> — language-alias hints', () => {
  test('"go" points at the Go web-framework adapters', () => {
    const r = runInit(['--adapter', 'go'], mktmp())
    expect(r.exitCode).not.toBe(0)
    expect(r.stderr).toContain('unknown adapter "go"')
    expect(r.stderr).toContain('echo, gin, chi, nethttp')
    expect(r.stderr).toContain('--adapter chi')
  })

  test('"golang" (near-miss) gets the same Go hint', () => {
    const r = runInit(['--adapter', 'golang'], mktmp())
    expect(r.exitCode).not.toBe(0)
    expect(r.stderr).toContain('echo, gin, chi, nethttp')
  })

  test('"Go" (mixed case) still matches the hint', () => {
    const r = runInit(['--adapter', 'Go'], mktmp())
    expect(r.exitCode).not.toBe(0)
    expect(r.stderr).toContain('echo, gin, chi, nethttp')
  })

  test('"perl" points at the Perl adapters', () => {
    const r = runInit(['--adapter', 'perl'], mktmp())
    expect(r.exitCode).not.toBe(0)
    expect(r.stderr).toContain('unknown adapter "perl"')
    expect(r.stderr).toContain('mojo, xslate')
    expect(r.stderr).toContain('--adapter mojo')
  })

  test('an unrelated unknown value keeps the generic "Available: ..." error', () => {
    const r = runInit(['--adapter', 'rust'], mktmp())
    expect(r.exitCode).not.toBe(0)
    expect(r.stderr).toContain('unknown adapter "rust"')
    expect(r.stderr).toContain('Available: hono, hono-node, echo, gin, chi, nethttp, mojo, xslate, csr')
    // No language-specific hint leaks in for a value that isn't one.
    expect(r.stderr).not.toContain('web-framework adapters')
  })
})

describe('bf init — non-interactive confirmation lines (--yes / explicit flags)', () => {
  test('an explicit --adapter/--css pair prints the same "✔ ..." lines the interactive picker would', () => {
    // `--css none` skips the registry probe entirely (no bundled
    // components to fetch), so this scaffolds fully offline.
    const cwd = mktmp()
    const r = runInit(['--adapter', 'csr', '--css', 'none', '--name', 'flagtest'], cwd)
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('✔ Choose a framework or runtime CSR')
    expect(r.stdout).toContain('✔ Choose a CSS library None')
  })
})
