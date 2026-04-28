import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import path from 'path'
import os from 'os'
import { detectPackageManager, commandsFor } from '../lib/pm'

describe('detectPackageManager', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `bf-pm-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('returns npm when no lockfile is present', () => {
    expect(detectPackageManager(tmpDir)).toBe('npm')
  })

  test('detects bun via bun.lock', () => {
    writeFileSync(path.join(tmpDir, 'bun.lock'), '')
    expect(detectPackageManager(tmpDir)).toBe('bun')
  })

  test('detects bun via bun.lockb', () => {
    writeFileSync(path.join(tmpDir, 'bun.lockb'), '')
    expect(detectPackageManager(tmpDir)).toBe('bun')
  })

  test('detects pnpm via pnpm-lock.yaml', () => {
    writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '')
    expect(detectPackageManager(tmpDir)).toBe('pnpm')
  })

  test('detects yarn via yarn.lock', () => {
    writeFileSync(path.join(tmpDir, 'yarn.lock'), '')
    expect(detectPackageManager(tmpDir)).toBe('yarn')
  })

  test('detects npm via package-lock.json', () => {
    writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}')
    expect(detectPackageManager(tmpDir)).toBe('npm')
  })

  test('prefers bun over npm when both lockfiles exist', () => {
    writeFileSync(path.join(tmpDir, 'bun.lock'), '')
    writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}')
    expect(detectPackageManager(tmpDir)).toBe('bun')
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
