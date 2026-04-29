import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs'
import path from 'path'
import os from 'os'
import { injectPathsIntoConfig } from '../commands/migrate'

describe('injectPathsIntoConfig', () => {
  test('inserts paths block at top of createConfig({...}) call', () => {
    const source = `import { createConfig } from '@barefootjs/hono/build'

export default createConfig({
  components: ['components'],
  outDir: 'dist',
})
`
    const result = injectPathsIntoConfig(source, {
      components: 'components/ui',
      tokens: 'tokens',
      meta: 'meta',
    })

    expect(result).not.toBeNull()
    expect(result).toContain('paths: {')
    expect(result).toContain(`components: "components/ui"`)
    expect(result).toContain(`tokens: "tokens"`)
    expect(result).toContain(`meta: "meta"`)
    // The original fields stay intact.
    expect(result).toContain(`components: ['components']`)
    expect(result).toContain(`outDir: 'dist'`)
  })

  test('matches the call-site indentation', () => {
    const source = `export default createConfig({
  outDir: 'dist',
})`
    const result = injectPathsIntoConfig(source, {
      components: 'a', tokens: 'b', meta: 'c',
    })!
    // Inserted lines should use a 4-space indent (call sits at 0, child = 2).
    expect(result).toMatch(/\n  paths: \{\n    components: "a",/)
  })

  test('also recognises defineConfig({...})', () => {
    const source = `export default defineConfig({
  outDir: 'dist',
})`
    const result = injectPathsIntoConfig(source, {
      components: 'x', tokens: 'y', meta: 'z',
    })
    expect(result).not.toBeNull()
    expect(result).toContain(`components: "x"`)
  })

  test('returns null when no createConfig call is found', () => {
    const source = `export default { adapter: { name: 'x' } }`
    const result = injectPathsIntoConfig(source, {
      components: 'a', tokens: 'b', meta: 'c',
    })
    expect(result).toBeNull()
  })
})

describe('migrate (e2e)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `bf-migrate-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('migrates a project: paths injected, json deleted', async () => {
    const tsPath = path.join(tmpDir, 'barefoot.config.ts')
    const jsonPath = path.join(tmpDir, 'barefoot.json')

    writeFileSync(
      tsPath,
      `import { createConfig } from '@barefootjs/hono/build'

export default createConfig({
  components: ['components'],
  outDir: 'dist',
})
`,
    )
    writeFileSync(
      jsonPath,
      JSON.stringify({
        $schema: 'https://barefootjs.dev/schema/barefoot.json',
        paths: { components: 'src/ui', tokens: 'src/tokens', meta: 'src/meta' },
      }, null, 2),
    )

    // Switch cwd to the tmp project so findBarefootJson picks it up.
    const prevCwd = process.cwd()
    process.chdir(tmpDir)
    try {
      const { run } = await import('../commands/migrate')
      // The codemod doesn't read ctx, only cwd.
      await run([], { root: tmpDir, metaDir: tmpDir, jsonFlag: false, config: null, projectDir: tmpDir })
    } finally {
      process.chdir(prevCwd)
    }

    expect(existsSync(jsonPath)).toBe(false)
    const patched = readFileSync(tsPath, 'utf-8')
    expect(patched).toContain(`components: "src/ui"`)
    expect(patched).toContain(`tokens: "src/tokens"`)
    expect(patched).toContain(`meta: "src/meta"`)
  })

  test('--dry-run keeps both files in place', async () => {
    const tsPath = path.join(tmpDir, 'barefoot.config.ts')
    const jsonPath = path.join(tmpDir, 'barefoot.json')

    const tsBefore = `export default createConfig({\n  outDir: 'dist',\n})\n`
    writeFileSync(tsPath, tsBefore)
    writeFileSync(
      jsonPath,
      JSON.stringify({ paths: { components: 'a', tokens: 'b', meta: 'c' } }),
    )

    const prevCwd = process.cwd()
    process.chdir(tmpDir)
    try {
      const { run } = await import('../commands/migrate')
      await run(['--dry-run'], { root: tmpDir, metaDir: tmpDir, jsonFlag: false, config: null, projectDir: tmpDir })
    } finally {
      process.chdir(prevCwd)
    }

    expect(existsSync(jsonPath)).toBe(true)
    expect(readFileSync(tsPath, 'utf-8')).toBe(tsBefore)
  })
})
