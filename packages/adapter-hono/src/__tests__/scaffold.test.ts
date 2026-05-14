// Specification-as-test for `bun create barefootjs@latest <project-name>`
// with the default Hono (Cloudflare Workers) adapter.
//
// This file verifies that the Hono scaffold satisfies both the
// cross-adapter contract defined in `create-barefootjs` and the
// Hono-specific wiring (wrangler.jsonc, CF Workers deploy, script shapes).
//
// The happy-path tests are gated by the same network flag as the
// companion mojo scaffold test, because `barefoot init` probes the live
// UI registry over the network:
//
//   BAREFOOT_CREATE_INTEGRATION=1 bun test src/__tests__/scaffold.test.ts

import { describe, test, expect, beforeAll } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  assertScaffoldContract,
  ensureCreateCli,
  type ScaffoldFacts,
} from '@barefootjs/adapter-tests'

// ---------------------------------------------------------------------------
// Helpers (thin wrappers around the compiled create-barefootjs CLI)
// ---------------------------------------------------------------------------

const CREATE_PKG_DIR = path.join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../create-barefootjs',
)
const CREATE_CLI = path.join(CREATE_PKG_DIR, 'dist', 'index.js')

function mktmp(): string {
  return mkdtempSync(path.join(tmpdir(), 'bf-hono-scaffold-test-'))
}

interface RunResult {
  exitCode: number | null
  stdout: string
  stderr: string
}

function runCreate(
  args: string[],
  opts: { cwd: string; env?: Record<string, string> },
): RunResult {
  ensureCreateCli(CREATE_PKG_DIR)
  const result = spawnSync('node', [CREATE_CLI, ...args], {
    cwd: opts.cwd,
    env: {
      ...process.env,
      ...opts.env,
      // Remove PM detection signal so commands are deterministic.
      npm_config_user_agent: undefined,
    },
    encoding: 'utf-8',
  })
  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

const INTEGRATION = process.env.BAREFOOT_CREATE_INTEGRATION === '1'

// ---------------------------------------------------------------------------
// Happy-path scenario — `bun create barefootjs@latest demo-app` (Hono default)
// ---------------------------------------------------------------------------

describe.skipIf(!INTEGRATION)(
  'Scenario: bun create barefootjs@latest <project-name> (Hono adapter)',
  () => {
    let result: RunResult
    let projectDir: string

    beforeAll(() => {
      const cwd = mktmp()
      result = runCreate(['demo-app'], { cwd })
      projectDir = path.join(cwd, 'demo-app')
    })

    test('satisfies the cross-adapter scaffold contract', () => {
      assertScaffoldContract({
        exitCode: result.exitCode,
        stdout: result.stdout,
        projectDir,
        adapterPackageName: '@barefootjs/hono',
        devReload: {
          // Hono CF uses `wrangler dev --live-reload`; wrangler injects
          // its own reload client, so no scaffold-side snippet is needed.
          subscribesBrowserInDev: true,
          gatedToDev: true,
          // No shared SSE protocol — wrangler manages the reload channel.
          sentinelSseEndpoint: null,
        },
      } satisfies ScaffoldFacts)
    })

    // -------------------------------------------------------------------------
    // Hono-specific wiring
    // -------------------------------------------------------------------------

    test('hono runtime dep is present alongside the adapter', () => {
      const pkg = JSON.parse(
        readFileSync(path.join(projectDir, 'package.json'), 'utf-8'),
      ) as { dependencies?: Record<string, string> }
      expect(pkg.dependencies?.['hono']).toBeDefined()
    })

    test('wrangler.jsonc is present (CF Workers target)', () => {
      expect(existsSync(path.join(projectDir, 'wrangler.jsonc'))).toBe(true)
    })

    test('wrangler.jsonc name matches the target directory', () => {
      // Without this, every scaffold would deploy as the generic
      // "my-app" Worker and overwrite each other on shared CF accounts.
      const raw = readFileSync(path.join(projectDir, 'wrangler.jsonc'), 'utf-8')
      const wrangler = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ''))
      expect(wrangler.name).toBe('demo-app')
    })

    test('dev script wires barefoot build --watch + unocss + wrangler dev --live-reload', () => {
      const pkg = JSON.parse(
        readFileSync(path.join(projectDir, 'package.json'), 'utf-8'),
      ) as { scripts?: Record<string, string> }
      expect(pkg.scripts?.dev).toContain('barefoot build --watch')
      expect(pkg.scripts?.dev).toContain('unocss --watch')
      expect(pkg.scripts?.dev).toContain('wrangler dev --live-reload')
    })

    test('deploy script targets Cloudflare Workers', () => {
      expect(result.stdout).toContain('Deploy:')
      expect(result.stdout).toMatch(/npm run deploy\s+# deploy to Cloudflare Workers/)
    })

    test('multi-segment positional path sanitizes name + cd uses full path', () => {
      const sandbox = mktmp()
      const r = runCreate(['foo/bar/bazz'], { cwd: sandbox })
      expect(r.exitCode).toBe(0)
      const nested = path.join(sandbox, 'foo', 'bar', 'bazz')
      const nestedPkg = JSON.parse(
        readFileSync(path.join(nested, 'package.json'), 'utf-8'),
      ) as { name: string }
      expect(nestedPkg.name).toBe('bazz')
      const nestedRaw = readFileSync(path.join(nested, 'wrangler.jsonc'), 'utf-8')
      const nestedWrangler = JSON.parse(nestedRaw.replace(/^\s*\/\/.*$/gm, ''))
      expect(nestedWrangler.name).toBe('bazz')
      expect(r.stdout).toMatch(/cd foo\/bar\/bazz/)
    })
  },
)

// ---------------------------------------------------------------------------
// Package-manager scenario — the detected PM dictates the post-scaffold guide
// ---------------------------------------------------------------------------

describe.skipIf(!INTEGRATION)(
  'Scenario: the invoking package manager dictates the next-step commands',
  () => {
    interface PmCase {
      pm: 'npm' | 'bun' | 'pnpm' | 'yarn'
      env: Record<string, string>
      install: string
      run: string
    }
    const cases: PmCase[] = [
      {
        pm: 'npm',
        env: { npm_config_user_agent: 'npm/10.0.0 node/v22.0.0 darwin arm64' },
        install: 'npm install',
        run: 'npm run dev',
      },
      {
        pm: 'bun',
        env: { npm_config_user_agent: 'bun/1.3.0' },
        install: 'bun install',
        run: 'bun run dev',
      },
      {
        pm: 'pnpm',
        env: { npm_config_user_agent: 'pnpm/9.0.0' },
        install: 'pnpm install',
        run: 'pnpm dev',
      },
      {
        pm: 'yarn',
        env: { npm_config_user_agent: 'yarn/4.0.0' },
        install: 'yarn',
        run: 'yarn dev',
      },
    ]

    test.each(cases)(
      'when invoked via $pm, the post-scaffold guide uses $pm commands',
      ({ env, install, run }) => {
        const cwd = mktmp()
        const r = runCreate(['demo-app'], { cwd, env })
        expect(r.exitCode).toBe(0)
        expect(r.stdout).toContain(install)
        expect(r.stdout).toContain(run)
      },
    )
  },
)
