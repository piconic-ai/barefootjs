// Deno smoke test for the `bf` package-manager layer.
//
// Run under the Deno runtime (see `.github/workflows/ci-deno.yml`):
//
//   deno run --allow-read --allow-write --allow-env \
//     packages/cli/scripts/deno-smoke.ts
//
// It imports `lib/pm.ts` directly — that module only depends on
// `node:fs` / `node:path`, so it loads natively under Deno with zero
// npm resolution — and asserts the `deno` code paths behave under the
// actual Deno runtime (not just under bun's test runner). This is the
// automated half of issue #1361's "is `bf` first-class on Deno?"
// question: it proves `detectPackageManager` / `commandsFor` resolve
// `deno` correctly when `process.versions.deno` is genuinely set.
//
// Deliberately framework-free (no bun:test / Deno.test) so the single
// file runs identically under `deno run`; failures `throw` and Deno
// exits non-zero, failing CI.

import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import {
  detectPackageManager,
  detectInvokingPackageManager,
  commandsFor,
} from '../src/lib/pm.ts'

// 1. We are genuinely running under Deno — the signal the CLI keys on.
assert.ok(process.versions.deno, 'expected to run under the Deno runtime')

// 2. With no lockfile, the live Deno runtime version makes the invoking
//    PM resolve to `deno` (the `deno run -A npm:bf` in an empty dir case).
assert.equal(
  detectInvokingPackageManager(),
  'deno',
  'detectInvokingPackageManager() should return "deno" under the Deno runtime',
)

// 3. Lockfile/config detection: a `deno.json` resolves to `deno`.
const tmp = mkdtempSync(path.join(tmpdir(), 'bf-deno-smoke-'))
try {
  writeFileSync(path.join(tmp, 'deno.json'), '{}')
  assert.equal(
    detectPackageManager(tmp, {} as NodeJS.ProcessEnv, {}),
    'deno',
    'detectPackageManager() should detect a deno.json project',
  )
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

// 4. Command shapes the docs tab + CLI hints render for Deno.
const deno = commandsFor('deno')
assert.equal(deno.install, 'deno install')
assert.equal(deno.run('dev'), 'deno task dev')
assert.equal(deno.exec('bf add button'), 'deno run -A npm:bf add button')
assert.equal(deno.test('Foo.test.tsx'), 'deno task test Foo.test.tsx')

console.log('✓ Deno smoke passed: bf package-manager layer is Deno-native')
