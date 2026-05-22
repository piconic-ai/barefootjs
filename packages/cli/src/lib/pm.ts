// Detect the user's package manager.
//
// Two signals, strongest first:
//   1. A lockfile in `dir` — the user has already committed to a tool.
//   2. The package manager that spawned this CLI, read from
//      `npm_config_user_agent` (set by npm/bun/pnpm/yarn). Catches the
//      common `bunx bf init` in an empty directory case where there
//      is no lockfile yet but the user clearly wants bun.
//
// Falls back to 'npm' when neither signal is available.

import { existsSync } from 'fs'
import path from 'path'

export type PackageManager = 'npm' | 'bun' | 'pnpm' | 'yarn'

const LOCKFILES: Record<PackageManager, string[]> = {
  bun: ['bun.lock', 'bun.lockb'],
  pnpm: ['pnpm-lock.yaml'],
  yarn: ['yarn.lock'],
  npm: ['package-lock.json'],
}

export function detectPackageManager(
  dir: string,
  env: NodeJS.ProcessEnv = process.env,
  versions: { bun?: string } = process.versions as { bun?: string },
): PackageManager {
  for (const pm of ['bun', 'pnpm', 'yarn', 'npm'] as const) {
    for (const file of LOCKFILES[pm]) {
      if (existsSync(path.join(dir, file))) return pm
    }
  }
  const invoked = detectInvokingPackageManager(env, versions)
  if (invoked) return invoked
  return 'npm'
}

// Two cooperating signals identify the invoking PM:
//   - `npm_config_user_agent`: every major PM sets this to a
//     `<name>/<version> ...` string when it spawns a child. Reliable for
//     `bunx <published-pkg>`, `npx`, `pnpm dlx`, `yarn dlx`.
//   - `process.versions.bun`: present whenever the bun runtime is in
//     use (covers local-path invocations like `bun ./dist/cli.js` or
//     a `#!/usr/bin/env bun` shebang, where the UA is not set). pnpm
//     and yarn share node's runtime, so they fall through to the UA
//     path only.
export function detectInvokingPackageManager(
  env: NodeJS.ProcessEnv = process.env,
  versions: { bun?: string } = process.versions as { bun?: string },
): PackageManager | null {
  const ua = env.npm_config_user_agent
  if (ua) {
    if (ua.startsWith('bun/')) return 'bun'
    if (ua.startsWith('pnpm/')) return 'pnpm'
    if (ua.startsWith('yarn/')) return 'yarn'
    if (ua.startsWith('npm/')) return 'npm'
  }
  if (versions.bun) return 'bun'
  return null
}

export interface PmCommands {
  install: string
  run: (script: string) => string
  exec: (cmd: string) => string
  /**
   * Test command targeted at a single file or directory. Each PM forwards
   * extra args to the package.json `test` script slightly differently —
   * npm requires `--`, the others forward by default — so callers that
   * want to suggest "run the test you just generated" should route
   * through this helper instead of hard-coding `bun test`.
   */
  test: (pathArg?: string) => string
}

export function commandsFor(pm: PackageManager): PmCommands {
  switch (pm) {
    case 'bun':
      return {
        install: 'bun install',
        run: s => `bun run ${s}`,
        exec: c => `bunx ${c}`,
        test: p => p ? `bun test ${p}` : 'bun test',
      }
    case 'pnpm':
      return {
        install: 'pnpm install',
        run: s => `pnpm ${s}`,
        exec: c => `pnpm dlx ${c}`,
        test: p => p ? `pnpm test ${p}` : 'pnpm test',
      }
    case 'yarn':
      return {
        install: 'yarn',
        run: s => `yarn ${s}`,
        exec: c => `yarn dlx ${c}`,
        test: p => p ? `yarn test ${p}` : 'yarn test',
      }
    case 'npm':
    default:
      return {
        install: 'npm install',
        run: s => `npm run ${s}`,
        exec: c => `npx ${c}`,
        // npm requires `--` to forward args to the script.
        test: p => p ? `npm test -- ${p}` : 'npm test',
      }
  }
}

/**
 * Per-PM test-runner configuration for the scaffold + `bf gen test` /
 * `bf gen component` code generators.
 *
 * Bun ships an in-runtime test runner (`bun:test`), so a bun-first user
 * scaffolds with `test: 'bun test'` + `import 'bun:test'` and no extra
 * devDeps beyond `@types/bun` (for the module declaration). Every other
 * PM lacks an in-runtime runner, so we default to Vitest — its
 * `describe` / `test` / `expect` surface is API-compatible with the
 * `bun:test` line `bf gen test` would otherwise emit, so the generated
 * file just works after `npm install` without any per-runner config.
 *
 * Centralising the decision here keeps scaffold (`init.ts`), `bf gen
 * test`, and `bf gen component` consistent: each one calls
 * `testRunnerFor(pm)` and reads the field it needs, instead of duplicating
 * the bun-vs-vitest branch at every call site (and drifting over time).
 */
export interface TestRunner {
  /** Import specifier the generated `*.test.tsx` puts on its header line. */
  importSource: string
  /** `package.json#scripts.test` value `bf init` writes for this PM. */
  scriptValue: string
  /**
   * devDependencies the scaffold adds for this PM. Bun: `@types/bun`
   * (for the `bun:test` module declaration); others: `vitest`.
   */
  devDeps: Record<string, string>
  /**
   * Comma-prefixed entry appended into the tsconfig `types` array (the
   * `{{__PM_TYPES_ENTRY__}}` slot in adapter tsconfigs). Bun needs
   * `, "bun-types"` so `import 'bun:test'` lines type-check; vitest
   * surfaces its types via the regular `from 'vitest'` import path, so
   * the slot collapses to an empty string.
   */
  typesEntry: string
}

export function testRunnerFor(pm: PackageManager): TestRunner {
  if (pm === 'bun') {
    // `--pass-with-no-tests` so `bun test` on a freshly scaffolded
    // project (before the user has run `bf gen test`) exits 0 instead
    // of failing the very first `<pm> test` they try.
    return {
      importSource: 'bun:test',
      scriptValue: 'bun test --pass-with-no-tests',
      devDeps: { '@types/bun': '^1.1.0' },
      typesEntry: ', "bun-types"',
    }
  }
  // Vitest's default `vitest` command runs in watch mode; `vitest run`
  // mirrors `bun test`'s "run once, exit" semantics so `<pm> test` in CI
  // doesn't hang waiting for stdin. `--passWithNoTests` matches the
  // bun branch — a fresh scaffold's first `<pm> test` should pass.
  return {
    importSource: 'vitest',
    scriptValue: 'vitest run --passWithNoTests',
    devDeps: { vitest: '^2.0.0' },
    typesEntry: '',
  }
}
