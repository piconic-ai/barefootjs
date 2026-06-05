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

// `node:` prefixes (not bare `fs` / `path`) so this module loads
// unchanged under every runtime `bf` may execute on — Node, Bun, and
// Deno. Deno only resolves builtins through the `node:` specifier, so
// the prefix is what lets `detectPackageManager` run under
// `deno run npm:bf ...` without a bundler rewrite.
import { existsSync } from 'node:fs'
import path from 'node:path'

export type PackageManager = 'npm' | 'bun' | 'pnpm' | 'yarn' | 'deno'

// Deno is matched last: a Deno project may keep a `package.json` (and
// thus an npm-family lockfile) for editor tooling, but `deno.lock` /
// `deno.json(c)` is the authoritative signal that the user drives the
// project with Deno. Listing it after the npm-family tools means a
// repo that committed to both still resolves to the npm-family
// lockfile that's actually installed, while a Deno-only repo (config
// but no npm lockfile) still resolves to `deno`.
const LOCKFILES: Record<PackageManager, string[]> = {
  bun: ['bun.lock', 'bun.lockb'],
  pnpm: ['pnpm-lock.yaml'],
  yarn: ['yarn.lock'],
  npm: ['package-lock.json'],
  deno: ['deno.lock', 'deno.json', 'deno.jsonc'],
}

export function detectPackageManager(
  dir: string,
  env: NodeJS.ProcessEnv = process.env,
  versions: { bun?: string; deno?: string } = process.versions as { bun?: string; deno?: string },
): PackageManager {
  for (const pm of ['bun', 'pnpm', 'yarn', 'npm', 'deno'] as const) {
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
//   - `process.versions.bun` / `process.versions.deno`: present
//     whenever the bun / Deno runtime is in use (covers local-path and
//     `npm:`-specifier invocations like `bun ./dist/cli.js`,
//     `deno run -A npm:bf`, or a `#!/usr/bin/env bun` shebang, where the
//     UA is not set). pnpm and yarn share node's runtime, so they fall
//     through to the UA path only.
//
// Deno is unusual: it does not set `npm_config_user_agent` and runs
// `bf` via `deno run npm:bf`, so the runtime version is the only
// reliable signal — checked after the UA so an explicit
// `pnpm dlx`/`npx` wrapper (which would set the UA) still wins.
export function detectInvokingPackageManager(
  env: NodeJS.ProcessEnv = process.env,
  versions: { bun?: string; deno?: string } = process.versions as { bun?: string; deno?: string },
): PackageManager | null {
  const ua = env.npm_config_user_agent
  if (ua) {
    if (ua.startsWith('bun/')) return 'bun'
    if (ua.startsWith('pnpm/')) return 'pnpm'
    if (ua.startsWith('yarn/')) return 'yarn'
    if (ua.startsWith('npm/')) return 'npm'
    if (ua.startsWith('deno/')) return 'deno'
  }
  if (versions.bun) return 'bun'
  if (versions.deno) return 'deno'
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
    case 'deno':
      return {
        // Deno 2 reads `package.json` (and `deno.json` tasks), so
        // `deno install` materialises the same dependency tree the
        // other PMs produce — no separate `deno cache` step needed.
        install: 'deno install',
        // package.json scripts surface as Deno tasks, so `deno task
        // <script>` mirrors `bun run <script>` / `pnpm <script>`.
        run: s => `deno task ${s}`,
        // One-shot binaries run straight from npm via the `npm:`
        // specifier; `-A` grants the filesystem/network access `bf`
        // needs to download and write components.
        exec: c => `deno run -A npm:${c}`,
        // The scaffold's `test` task forwards extra args without a `--`
        // separator (like bun/pnpm/yarn), so the targeted form just
        // appends the path.
        test: p => p ? `deno task test ${p}` : 'deno task test',
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
    return {
      importSource: 'bun:test',
      scriptValue: 'bun test',
      devDeps: { '@types/bun': '^1.1.0' },
      typesEntry: ', "bun-types"',
    }
  }
  // Vitest's default `vitest` command runs in watch mode; `vitest run`
  // mirrors `bun test`'s "run once, exit" semantics so `<pm> test` in CI
  // doesn't hang waiting for stdin.
  return {
    importSource: 'vitest',
    scriptValue: 'vitest run',
    devDeps: { '@types/node': '^22.0.0', vitest: '^4.0.0' },
    typesEntry: '',
  }
}
