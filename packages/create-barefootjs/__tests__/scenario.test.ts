// Specification-as-test for `npm create barefootjs@latest <project-name>`.
//
// Read this file top-to-bottom to learn the full scaffold flow: each
// outer `describe` is one user-observable step, in the order it appears
// in stdout. The happy-path scenario is gated by an env flag because
// `barefoot init` probes the live UI registry over the network:
//
//   BAREFOOT_CREATE_INTEGRATION=1 bun test scenario.test.ts
//
// The companion scenarios at the bottom (target-dir guards, --help)
// don't reach the registry and always run.

import { describe, test, expect, beforeAll } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { mktmp, runCreate, type RunResult } from './helpers'

const INTEGRATION = process.env.BAREFOOT_CREATE_INTEGRATION === '1'

// ---------------------------------------------------------------------------
// Happy-path scenario — `bun create barefootjs@latest demo-app`
//
// Steps the user sees:
//   1. Resolve the target directory
//   2. Choose an adapter      (defaults to Hono, non-interactive)
//   3. Choose a CSS library   (defaults to UnoCSS, non-interactive)
//   4. Probe the BarefootJS UI registry
//   5. Write the runnable starter file set
//   6. Detect the package manager and print next-step instructions
// ---------------------------------------------------------------------------

describe.skipIf(!INTEGRATION)(
  'Scenario: bun create barefootjs@latest <project-name>',
  () => {
    let result: RunResult
    let projectDir: string
    let pkg: {
      name: string
      type: string
      scripts: Record<string, string>
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    beforeAll(() => {
      const cwd = mktmp()
      result = runCreate(['demo-app'], { cwd })
      projectDir = path.join(cwd, 'demo-app')
      pkg = JSON.parse(readFileSync(path.join(projectDir, 'package.json'), 'utf-8'))
    })

    describe('Step 1 — Resolve the target directory', () => {
      test('uses the positional argument as the project folder', () => {
        expect(existsSync(projectDir)).toBe(true)
      })

      test('confirms the chosen directory with "Using target directory"', () => {
        expect(result.stdout).toContain('Using target directory … demo-app')
      })

      test('announces the destination before doing any work', () => {
        expect(result.stdout).toMatch(/Scaffolding BarefootJS app in .*demo-app/)
      })
    })

    describe('Step 2 — Choose an adapter (Hono by default)', () => {
      test('non-interactive runs pick the registry default (Hono)', () => {
        expect(result.stdout).toMatch(/Adapter:\s+Hono/)
      })

      test('the chosen adapter is wired into package.json dependencies', () => {
        expect(pkg.dependencies['@barefootjs/hono']).toBeDefined()
        expect(pkg.dependencies['hono']).toBeDefined()
      })
    })

    describe('Step 3 — Choose a CSS library (UnoCSS by default)', () => {
      test('non-interactive runs pick the default CSS library (UnoCSS)', () => {
        expect(result.stdout).toMatch(/CSS library:\s+UnoCSS/)
      })

      test('UnoCSS config and generated stylesheet are present', () => {
        expect(pkg.devDependencies['unocss']).toBeDefined()
        expect(existsSync(path.join(projectDir, 'uno.config.ts'))).toBe(true)
        expect(existsSync(path.join(projectDir, 'public/uno.css'))).toBe(true)
      })
    })

    describe('Step 4 — Probe the BarefootJS UI registry', () => {
      test('does not bail with a registry-unreachable error', () => {
        // Registry probing is silent on success. We assert via the
        // contract that scaffolding proceeded past the probe.
        expect(result.stderr).not.toContain('cannot reach the BarefootJS UI registry')
        expect(result.stdout).toContain('Initializing BarefootJS app')
      })
    })

    describe('Step 5 — Write the runnable starter file set', () => {
      test.each([
        'server.tsx',
        'factory.ts',
        'renderer.tsx',
        'barefoot.config.ts',
        'tsconfig.json',
        'uno.config.ts',
        'components/Counter.tsx',
        'public/styles.css',
        'public/tokens.css',
        'public/uno.css',
        'dist/components/manifest.json',
        'meta/index.json',
        'package.json',
        'components/ui/button/index.tsx',
        'components/ui/slot/index.tsx',
        'types/index.tsx',
      ])('writes %s', (rel) => {
        expect(existsSync(path.join(projectDir, rel))).toBe(true)
      })

      test('package.json is named after the target directory', () => {
        expect(pkg.name).toBe('demo-app')
      })

      test('package.json exposes dev / build / start scripts', () => {
        expect(pkg.scripts.dev).toBeString()
        expect(pkg.scripts.build).toBeString()
        expect(pkg.scripts.start).toBeString()
      })
    })

    describe('Step 6 — Detect the package manager and print next steps', () => {
      test('auto-detects the package manager and announces it', () => {
        // The happy-path run had no PM signal injected, so detection
        // falls through to the npm default.
        expect(result.stdout).toContain('detected package manager: npm')
      })

      test('prints the install / dev next-step guide', () => {
        expect(result.stdout).toContain('Next steps:')
        expect(result.stdout).toMatch(/Install dependencies/)
        expect(result.stdout).toMatch(/Start the dev server/)
        expect(result.stdout).toMatch(/http:\/\/localhost:\d+/)
      })

      test('exits 0', () => {
        expect(result.exitCode).toBe(0)
      })
    })
  },
)

// ---------------------------------------------------------------------------
// Package-manager scenario — the auto-detected PM is announced AND it
// dictates the exact commands printed in the post-scaffold guide.
//
// Detection signal used here: `npm_config_user_agent`, set by every
// major PM when it spawns a child process (e.g. `bun create barefootjs`
// → `npm_config_user_agent=bun/...`). Lockfile-based detection is a
// stronger signal but never fires here because the freshly scaffolded
// project has no lockfile yet.
// ---------------------------------------------------------------------------

describe.skipIf(!INTEGRATION)(
  'Scenario: the invoking package manager dictates the next-step commands',
  () => {
    interface PmCase {
      pm: 'npm' | 'bun' | 'pnpm' | 'yarn'
      env: Record<string, string>
      install: string
      run: string
      exec: string
    }
    const cases: PmCase[] = [
      {
        pm: 'npm',
        env: { npm_config_user_agent: 'npm/10.0.0 node/v22.0.0 darwin arm64' },
        install: 'npm install',
        run: 'npm run dev',
        exec: 'npx ',
      },
      {
        pm: 'bun',
        env: { npm_config_user_agent: 'bun/1.3.0' },
        install: 'bun install',
        run: 'bun run dev',
        exec: 'bunx ',
      },
      {
        pm: 'pnpm',
        env: { npm_config_user_agent: 'pnpm/9.0.0' },
        install: 'pnpm install',
        run: 'pnpm dev',
        exec: 'pnpm dlx ',
      },
      {
        pm: 'yarn',
        env: { npm_config_user_agent: 'yarn/4.0.0' },
        install: 'yarn',
        run: 'yarn dev',
        exec: 'yarn dlx ',
      },
    ]

    test.each(cases)(
      'when invoked via $pm, the post-scaffold guide uses $pm commands',
      ({ pm, env, install, run, exec }) => {
        const cwd = mktmp()
        const r = runCreate(['demo-app'], { cwd, env })

        expect(r.exitCode).toBe(0)
        // Announcement: detection picked up the invoking PM.
        expect(r.stdout).toContain(`detected package manager: ${pm}`)
        // The install / dev hints quote the matching commands.
        expect(r.stdout).toContain(install)
        expect(r.stdout).toContain(run)
        // "Then try:" lines use the PM's `exec` form (npx / bunx / pnpm dlx / yarn dlx).
        expect(r.stdout).toContain(exec)
      },
    )
  },
)

// ---------------------------------------------------------------------------
// Companion scenarios — alternative flows that don't follow the happy path.
// These run offline (no registry probe is reached).
// ---------------------------------------------------------------------------

describe('Scenario: how the target directory is chosen (no network)', () => {
  // Three branches the user can land in when invoking the CLI:
  //   (a) explicit positional arg → "Using target directory" confirmation
  //   (b) --yes / -y               → silent default acceptance
  //   (c) interactive prompt       → "Target directory: (my-barefoot-app)"
  //                                  (TTY-gated; non-TTY falls back to default)

  describe('(a) When a positional argument is provided', () => {
    test('uses it verbatim and confirms with "Using target directory …"', () => {
      const cwd = mktmp()
      const r = runCreate(['demo-app'], { cwd })
      expect(r.stdout).toContain('Using target directory … demo-app')
      expect(r.stdout).toMatch(/Scaffolding BarefootJS app in .*demo-app/)
    })
  })

  describe('(b) When --yes / -y is passed without a positional argument', () => {
    test('skips the prompt and silently accepts "my-barefoot-app"', () => {
      const cwd = mktmp()
      const r = runCreate(['--yes'], { cwd })
      expect(r.stdout).toContain('Using target directory … my-barefoot-app')
      expect(r.stdout).toMatch(/Scaffolding BarefootJS app in .*my-barefoot-app/)
    })

    test('-y is accepted as an alias', () => {
      const cwd = mktmp()
      const r = runCreate(['-y'], { cwd })
      expect(r.stdout).toContain('Using target directory … my-barefoot-app')
    })
  })

  describe('(c) When neither a positional argument nor --yes is given', () => {
    test('falls back to "my-barefoot-app" in non-TTY contexts (no hang)', () => {
      // The spawned child inherits a piped stdin (not a TTY), so the
      // text() helper short-circuits to the default instead of trying
      // to render a prompt.
      const cwd = mktmp()
      const r = runCreate([], { cwd })
      expect(r.stdout).toMatch(/Scaffolding BarefootJS app in .*my-barefoot-app/)
    })
  })

  describe('Guards applied to the resolved directory', () => {
    test('refuses to scaffold into an existing non-empty directory', () => {
      const cwd = mktmp()
      const projectDir = path.join(cwd, 'demo-app')
      mkdirSync(projectDir)
      writeFileSync(path.join(projectDir, 'README.md'), '# pre-existing')

      const r = runCreate(['demo-app'], { cwd })
      expect(r.exitCode).not.toBe(0)
      expect(r.stderr).toContain('exists and is not empty')
    })

    test('treats a dotfile-only directory (e.g. fresh `git init`) as empty', () => {
      const cwd = mktmp()
      const projectDir = path.join(cwd, 'demo-app')
      mkdirSync(projectDir)
      writeFileSync(path.join(projectDir, '.gitkeep'), '')

      const r = runCreate(['demo-app'], { cwd })
      expect(r.stderr).not.toContain('exists and is not empty')
      expect(r.stdout).toContain('Scaffolding BarefootJS app in')
    })
  })
})

describe('Scenario: bun create barefootjs@latest --help', () => {
  test('--help prints usage and exits 0 without touching the filesystem', () => {
    const cwd = mktmp()
    const r = runCreate(['--help'], { cwd })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('Usage:')
    expect(r.stdout).toContain('Scaffolds a runnable BarefootJS app')
    expect(r.stdout).toContain('--adapter')
    // Both top-level flags are documented.
    expect(r.stdout).toMatch(/-y, --yes/)
    expect(readdirSync(cwd)).toHaveLength(0)
  })

  test('-h is accepted as an alias for --help', () => {
    const r = runCreate(['-h'], { cwd: mktmp() })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('Usage:')
  })
})
