import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import path from 'path'
import os from 'os'
import { detectPackageManager, detectInvokingPackageManager, commandsFor } from '../lib/pm'

// Empty env keeps lockfile-detection tests independent of how the test
// runner itself was launched (e.g. `bun test` sets npm_config_user_agent).
const EMPTY_ENV = {} as NodeJS.ProcessEnv
const EMPTY_VERSIONS = {} as { bun?: string }

describe('detectPackageManager', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `bf-pm-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('returns npm when no lockfile and no user agent', () => {
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('npm')
  })

  test('detects bun via bun.lock', () => {
    writeFileSync(path.join(tmpDir, 'bun.lock'), '')
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('bun')
  })

  test('detects bun via bun.lockb', () => {
    writeFileSync(path.join(tmpDir, 'bun.lockb'), '')
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('bun')
  })

  test('detects pnpm via pnpm-lock.yaml', () => {
    writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '')
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('pnpm')
  })

  test('detects yarn via yarn.lock', () => {
    writeFileSync(path.join(tmpDir, 'yarn.lock'), '')
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('yarn')
  })

  test('detects npm via package-lock.json', () => {
    writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}')
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('npm')
  })

  test('prefers bun over npm when both lockfiles exist', () => {
    writeFileSync(path.join(tmpDir, 'bun.lock'), '')
    writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}')
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('bun')
  })

  test('falls back to invoking PM (bunx) when no lockfile is present', () => {
    const env = { npm_config_user_agent: 'bun/1.1.0 npm/? node/v22.0.0 darwin arm64' } as NodeJS.ProcessEnv
    expect(detectPackageManager(tmpDir, env)).toBe('bun')
  })

  test('falls back to invoking PM (pnpm dlx) when no lockfile is present', () => {
    const env = { npm_config_user_agent: 'pnpm/9.0.0 npm/? node/v22.0.0 darwin arm64' } as NodeJS.ProcessEnv
    expect(detectPackageManager(tmpDir, env)).toBe('pnpm')
  })

  test('lockfile wins over invoking PM', () => {
    writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '')
    const env = { npm_config_user_agent: 'bun/1.1.0' } as NodeJS.ProcessEnv
    expect(detectPackageManager(tmpDir, env)).toBe('pnpm')
  })

  test('falls back to bun runtime when env has no UA (e.g. `bun ./cli.js`)', () => {
    expect(detectPackageManager(tmpDir, EMPTY_ENV, { bun: '1.3.0' })).toBe('bun')
  })

  test('UA wins over bun runtime when both are present', () => {
    const env = { npm_config_user_agent: 'pnpm/9.0.0' } as NodeJS.ProcessEnv
    expect(detectPackageManager(tmpDir, env, { bun: '1.3.0' })).toBe('pnpm')
  })
})

describe('detectInvokingPackageManager', () => {
  test('returns null when user agent is missing and not on bun', () => {
    expect(detectInvokingPackageManager(EMPTY_ENV, EMPTY_VERSIONS)).toBeNull()
  })

  test('detects bun', () => {
    const env = { npm_config_user_agent: 'bun/1.1.0' } as NodeJS.ProcessEnv
    expect(detectInvokingPackageManager(env, EMPTY_VERSIONS)).toBe('bun')
  })

  test('detects npm', () => {
    const env = { npm_config_user_agent: 'npm/10.0.0 node/v22.0.0' } as NodeJS.ProcessEnv
    expect(detectInvokingPackageManager(env, EMPTY_VERSIONS)).toBe('npm')
  })

  test('detects pnpm', () => {
    const env = { npm_config_user_agent: 'pnpm/9.0.0 npm/? node/v22.0.0' } as NodeJS.ProcessEnv
    expect(detectInvokingPackageManager(env, EMPTY_VERSIONS)).toBe('pnpm')
  })

  test('detects yarn', () => {
    const env = { npm_config_user_agent: 'yarn/4.0.0 npm/? node/v22.0.0' } as NodeJS.ProcessEnv
    expect(detectInvokingPackageManager(env, EMPTY_VERSIONS)).toBe('yarn')
  })

  test('returns null for unknown user agent (not on bun)', () => {
    const env = { npm_config_user_agent: 'deno/1.0.0' } as NodeJS.ProcessEnv
    expect(detectInvokingPackageManager(env, EMPTY_VERSIONS)).toBeNull()
  })

  test('detects bun runtime when UA is absent', () => {
    expect(detectInvokingPackageManager(EMPTY_ENV, { bun: '1.3.0' })).toBe('bun')
  })
})

describe('commandsFor', () => {
  test('npm commands', () => {
    const c = commandsFor('npm')
    expect(c.install).toBe('npm install')
    expect(c.run('dev')).toBe('npm run dev')
    expect(c.exec('barefoot add button')).toBe('npx barefoot add button')
  })

  test('bun commands', () => {
    const c = commandsFor('bun')
    expect(c.install).toBe('bun install')
    expect(c.run('dev')).toBe('bun run dev')
    expect(c.exec('barefoot add button')).toBe('bunx barefoot add button')
  })

  test('pnpm commands', () => {
    const c = commandsFor('pnpm')
    expect(c.install).toBe('pnpm install')
    expect(c.run('dev')).toBe('pnpm dev')
    expect(c.exec('barefoot add button')).toBe('pnpm dlx barefoot add button')
  })

  test('yarn commands', () => {
    const c = commandsFor('yarn')
    expect(c.install).toBe('yarn')
    expect(c.run('dev')).toBe('yarn dev')
    expect(c.exec('barefoot add button')).toBe('yarn dlx barefoot add button')
  })
})
