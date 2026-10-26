import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

test('fixture smoke fails when its selected backend cannot render', () => {
  const bin = mkdtempSync(join(tmpdir(), 'bf-smoke-no-runtime-'))
  try {
    symlinkSync(process.execPath, join(bin, 'bun'))
    const root = fileURLToPath(new URL('../../..', import.meta.url))
    const result = Bun.spawnSync([
      process.execPath, 'scripts/smoke-fixtures.ts',
      'template-literal-static-delimiters', '--only', 'jinja',
    ], {
      cwd: root,
      env: { ...process.env, PATH: bin, BF_REQUIRE_RENDER: '0' },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const output = result.stdout.toString() + result.stderr.toString()
    expect(result.exitCode).toBe(1)
    expect(output).toContain('PythonNotAvailableError')
    expect(output).not.toContain('passes on 1 suites')
  } finally {
    rmSync(bin, { recursive: true, force: true })
  }
})
