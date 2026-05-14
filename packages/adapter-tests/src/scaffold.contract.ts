// Cross-adapter scaffold contract for `create-barefootjs`.
//
// Defines the baseline scenario every scaffold adapter must satisfy.
// Read this file to understand the minimum scaffold requirements; each
// adapter's `scaffold.test.ts` extracts the facts from its own output
// and calls `assertScaffoldContract`, then adds adapter-specific assertions
// on top.
//
// The contract mirrors the step structure of the CLI output:
//   0. The command exits successfully.
//   1. The target directory is confirmed in stdout.
//   2. The adapter's runtime package lands in package.json dependencies.
//   3. barefoot.config.ts is written.
//   4. dev and build scripts are present in package.json.
//   5. The post-scaffold "Get started" guide is printed.
//   6. The dev-reload contract is satisfied (see dev-reload.contract.ts).
//
// Each adapter calls `assertScaffoldContract` from its integration test:
//
//   BAREFOOT_CREATE_INTEGRATION=1 bun test src/__tests__/scaffold.test.ts

import { expect } from 'bun:test'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { assertDevReloadContract, type DevReloadFacts } from './dev-reload.contract'

export interface ScaffoldFacts {
  /** Exit code of `bun create barefootjs`. */
  exitCode: number | null
  /** Combined stdout of the create command. */
  stdout: string
  /** Absolute path to the scaffolded project directory. */
  projectDir: string
  /**
   * The adapter's runtime package name, e.g. `'@barefootjs/hono'` or
   * `'@barefootjs/mojolicious'`. Checked against `package.json`
   * dependencies so a rename or omission surfaces immediately.
   */
  adapterPackageName: string
  /**
   * Dev-reload facts extracted from the scaffold output. Adapters vary
   * in how they wire the reload subscriber (SSE endpoint, wrangler
   * `--live-reload`, etc.) but all must satisfy the contract — see
   * `dev-reload.contract.ts` for details.
   */
  devReload: DevReloadFacts
}

/**
 * Assert that a scaffold adapter's output satisfies the cross-adapter
 * baseline. Call from each `scaffold.test.ts` after running
 * `bun create barefootjs --adapter <name>` and reading the facts from
 * the generated files.
 *
 * Failure messages name the contract step so a regression points at the
 * contract surface; the per-adapter test should also assert the
 * adapter-specific wiring directly so a failure pinpoints the exact file.
 */
export function assertScaffoldContract(facts: ScaffoldFacts): void {
  // Step 0: clean exit
  expect(facts.exitCode).toBe(0)

  // Step 1: target directory confirmed in stdout
  expect(facts.stdout).toContain('✔ Target directory')

  const pkg = JSON.parse(readFileSync(path.join(facts.projectDir, 'package.json'), 'utf-8')) as {
    dependencies?: Record<string, string>
    scripts?: Record<string, string>
  }

  // Step 2: adapter runtime package present in dependencies
  expect(pkg.dependencies?.[facts.adapterPackageName]).toBeTruthy()

  // Step 3: barefoot.config.ts written
  expect(existsSync(path.join(facts.projectDir, 'barefoot.config.ts'))).toBe(true)

  // Step 4: dev and build scripts present
  expect(pkg.scripts?.dev).toBeString()
  expect(pkg.scripts?.build).toBeString()

  // Step 5: post-scaffold guide printed
  expect(facts.stdout).toContain('Get started:')

  // Step 6: dev-reload contract
  assertDevReloadContract(facts.devReload)
}

/**
 * Ensure the `create-barefootjs` CLI is built before scaffold integration
 * tests run. Mirrors the `ensureBuilt()` helper in `create-barefootjs`'s
 * own test suite so adapter packages don't need to depend on that package's
 * internal test helpers.
 *
 * @param createPkgDir  Absolute path to the `create-barefootjs` package root
 *                      (the directory that contains `package.json` and `src/`).
 */
export function ensureCreateCli(createPkgDir: string): void {
  const cliPath = path.join(createPkgDir, 'dist', 'index.js')
  const srcPath = path.join(createPkgDir, 'src', 'index.ts')
  const srcMtime = statSync(srcPath).mtimeMs
  const distFresh = existsSync(cliPath) && statSync(cliPath).mtimeMs >= srcMtime
  if (!distFresh) {
    const res = spawnSync('bun', ['run', 'build'], {
      cwd: createPkgDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (res.status !== 0) {
      throw new Error(`create-barefootjs build failed:\n${res.stdout}\n${res.stderr}`)
    }
  }
}
