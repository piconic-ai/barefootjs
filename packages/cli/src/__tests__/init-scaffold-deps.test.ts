// Scaffold reproducibility (#2123):
//   1. `@barefootjs/*` deps/devDeps are pinned to `^<CLI_VERSION>` at
//      scaffold time, not left at the `'latest'` sentinel the adapter
//      templates carry (see `pinBarefootDeps` in `../commands/init.ts`).
//      Two teammates scaffolding a week apart — or a bad publish —
//      would otherwise land on different `@barefootjs/*` versions.
//   2. The Hono adapter's `wrangler` is a real devDependency invoked
//      directly from `node_modules/.bin`, not an unpinned `npx`/`bunx`/
//      `pnpm dlx`/`yarn dlx wrangler` on every `dev`/`deploy` run.
//
// We spawn the real CLI entry (mirrors `./init-gate.test.ts`) with
// `--css none` so the scaffold completes without touching the network
// (the UI-registry pre-flight probe is skipped entirely for `--css
// none` — see the comment above `probeRegistry`'s call site in
// `../commands/init.ts`).

import { describe, test, expect } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { ADAPTERS } from '../lib/templates'

const CLI_ENTRY = path.join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  'index.ts',
)
const CLI_PACKAGE_JSON = path.join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  'package.json',
)

function mktmp(): string {
  return mkdtempSync(path.join(tmpdir(), 'bf-init-scaffold-deps-test-'))
}

interface ScaffoldPkgJson {
  scripts: Record<string, string>
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

function scaffold(adapter: string): ScaffoldPkgJson {
  const cwd = mktmp()
  const result = spawnSync(
    'bun',
    [CLI_ENTRY, 'init', '--name', 'scaffold-deps-test', '--adapter', adapter, '--css', 'none'],
    {
      env: { ...process.env, BAREFOOT_INIT_VIA_CREATE: '1' },
      encoding: 'utf-8',
      cwd,
    },
  )
  if (result.status !== 0) {
    throw new Error(`scaffold failed (exit ${result.status}):\n${result.stderr}`)
  }
  const raw = readFileSync(path.join(cwd, 'package.json'), 'utf-8')
  return JSON.parse(raw) as ScaffoldPkgJson
}

describe('scaffolded package.json pins @barefootjs/* deps to the CLI version (#2123)', () => {
  test('dependencies + devDependencies match ^<cli package.json version>, never "latest"', () => {
    const { version: cliVersion } = JSON.parse(readFileSync(CLI_PACKAGE_JSON, 'utf-8')) as {
      version: string
    }
    const pkg = scaffold('hono')
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }

    const barefootDeps = Object.entries(allDeps).filter(([name]) => name.startsWith('@barefootjs/'))
    // Sanity: the adapter actually contributes some @barefootjs/* deps,
    // otherwise the assertions below would vacuously pass.
    expect(barefootDeps.length).toBeGreaterThan(0)
    for (const [name, value] of barefootDeps) {
      expect(value).toBe(`^${cliVersion}`)
    }

    // No dependency anywhere (barefootjs or otherwise) should carry the
    // unpinned sentinel through to a real scaffold.
    for (const value of Object.values(allDeps)) {
      expect(value).not.toBe('latest')
    }
  })

  test('non-@barefootjs/* deps (hono, typescript, ...) pass through untouched', () => {
    // Assert against the adapter template's own values rather than
    // hardcoding version strings here — a routine hono/typescript bump
    // in the template shouldn't fail this test; only a pass-through
    // regression (the pin rewriting deps it must not touch) should.
    const pkg = scaffold('hono')
    expect(pkg.dependencies.hono).toBe(ADAPTERS.hono.dependencies.hono)
    expect(pkg.devDependencies.typescript).toBe(ADAPTERS.hono.devDependencies.typescript)
  })
})

describe('hono scaffold pins wrangler as a devDependency and invokes it directly (#2123)', () => {
  test('wrangler is a devDependency, not resolved via npx/bunx/dlx', () => {
    const pkg = scaffold('hono')
    expect(pkg.devDependencies.wrangler).toBeTruthy()
    expect(pkg.devDependencies.wrangler).not.toBe('latest')

    // The dev/deploy scripts call `wrangler` straight from
    // node_modules/.bin (package.json scripts do this automatically) —
    // no package-manager dlx wrapper, which would otherwise force an
    // unpinned download on the first run.
    expect(pkg.scripts.dev).toContain('wrangler dev --live-reload')
    expect(pkg.scripts.deploy).toContain('wrangler deploy')
    for (const script of [pkg.scripts.dev, pkg.scripts.deploy]) {
      expect(script).not.toContain('npx wrangler')
      expect(script).not.toContain('bunx wrangler')
      expect(script).not.toContain('pnpm dlx wrangler')
      expect(script).not.toContain('yarn dlx wrangler')
      expect(script).not.toContain('deno x npm:wrangler')
    }
  })
})
