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
