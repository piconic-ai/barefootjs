// Detect the user's package manager from lockfiles in `dir`.
// Returns 'npm' as a safe default when no lockfile is found.

import { existsSync } from 'fs'
import path from 'path'

export type PackageManager = 'npm' | 'bun' | 'pnpm' | 'yarn'

const LOCKFILES: Record<PackageManager, string[]> = {
  bun: ['bun.lock', 'bun.lockb'],
  pnpm: ['pnpm-lock.yaml'],
  yarn: ['yarn.lock'],
  npm: ['package-lock.json'],
}

export function detectPackageManager(dir: string): PackageManager {
  for (const pm of ['bun', 'pnpm', 'yarn', 'npm'] as const) {
    for (const file of LOCKFILES[pm]) {
      if (existsSync(path.join(dir, file))) return pm
    }
  }
  return 'npm'
}

export interface PmCommands {
  install: string
  run: (script: string) => string
  exec: (cmd: string) => string
}

export function commandsFor(pm: PackageManager): PmCommands {
  switch (pm) {
    case 'bun':
      return {
        install: 'bun install',
        run: s => `bun run ${s}`,
        exec: c => `bunx ${c}`,
      }
    case 'pnpm':
      return {
        install: 'pnpm install',
        run: s => `pnpm ${s}`,
        exec: c => `pnpm dlx ${c}`,
      }
    case 'yarn':
      return {
        install: 'yarn',
        run: s => `yarn ${s}`,
        exec: c => `yarn dlx ${c}`,
      }
    case 'npm':
    default:
      return {
        install: 'npm install',
        run: s => `npm run ${s}`,
        exec: c => `npx ${c}`,
      }
  }
}
