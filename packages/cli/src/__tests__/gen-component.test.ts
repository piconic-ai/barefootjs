import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { run } from '../commands/gen-component'
import type { CliContext } from '../context'

let projectDir: string

beforeEach(() => { projectDir = mkdtempSync(path.join(tmpdir(), 'bf-gen-comp-')) })
afterEach(() => { rmSync(projectDir, { recursive: true, force: true }) })

function ctxFor(): CliContext {
  return {
    root: projectDir,
    metaDir: path.join(projectDir, 'meta'),
    jsonFlag: false,
    projectDir,
    config: {
      paths: { components: 'components/ui', tokens: 'tokens', meta: 'meta' },
    },
  }
}

describe('bf gen component', () => {
  test('no args exits with usage error', () => {
    const errSpy = spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`exit ${code}`)
    }) as never
    try {
      expect(() => run([], ctxFor())).toThrow('exit 1')
      expect(errSpy.mock.calls[0][0]).toContain('Usage:')
    } finally {
      errSpy.mockRestore()
      exitSpy.mockRestore()
    }
  })

  test('name-only (no use-components) creates component and test', () => {
    mkdirSync(path.join(projectDir, 'meta'), { recursive: true })
    const logSpy = spyOn(console, 'log').mockImplementation(() => {})
    try {
      run(['my-widget'], ctxFor())
      const compPath = path.join(projectDir, 'components/ui/my-widget/index.tsx')
      const testPath = path.join(projectDir, 'components/ui/my-widget/index.test.tsx')
      expect(existsSync(compPath)).toBe(true)
      expect(existsSync(testPath)).toBe(true)
      const code = readFileSync(compPath, 'utf-8')
      expect(code).toContain('function MyWidget')
      expect(code).not.toContain('import {')
    } finally {
      logSpy.mockRestore()
    }
  })

  test('name + use-components imports the specified components', () => {
    mkdirSync(path.join(projectDir, 'meta'), { recursive: true })
    const logSpy = spyOn(console, 'log').mockImplementation(() => {})
    try {
      run(['profile-card', 'button', 'badge'], ctxFor())
      const compPath = path.join(projectDir, 'components/ui/profile-card/index.tsx')
      expect(existsSync(compPath)).toBe(true)
      const code = readFileSync(compPath, 'utf-8')
      expect(code).toContain('function ProfileCard')
    } finally {
      logSpy.mockRestore()
    }
  })
})
