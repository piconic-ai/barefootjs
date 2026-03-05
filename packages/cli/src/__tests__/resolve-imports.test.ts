import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import { resolveRelativeImports } from '../lib/resolve-imports'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { resolve } from 'path'
import { tmpdir } from 'os'

const TEST_DIR = resolve(tmpdir(), `bf-test-resolve-imports-${Date.now()}`)
const DIST_DIR = resolve(TEST_DIR, 'dist')
const COMPONENTS_DIR = resolve(DIST_DIR, 'components')
const SOURCE_DIR = resolve(TEST_DIR, 'src')

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
  mkdirSync(COMPONENTS_DIR, { recursive: true })
  mkdirSync(SOURCE_DIR, { recursive: true })
})

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('resolveRelativeImports', () => {
  test('inlines pure .ts module', async () => {
    // Write a utility module next to the client JS
    writeFileSync(resolve(COMPONENTS_DIR, 'utils.ts'), `
export function highlight(code: string): string {
  return '<pre>' + code + '</pre>'
}
`)
    // Write client JS that imports the utility
    const clientJs = `import { highlight } from './utils'
import { createSignal } from '@barefootjs/dom'
console.log(highlight('hello'))
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Demo-abc123.js'), clientJs)

    const manifest = {
      Demo: { clientJs: 'components/Demo-abc123.js', markedTemplate: 'components/Demo.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Demo-abc123.js')).text()
    // Should contain the inlined function (without export keyword)
    expect(result).toContain('function highlight(code)')
    // Should NOT contain the original import
    expect(result).not.toContain("from './utils'")
    // Should keep package imports untouched
    expect(result).toContain("from '@barefootjs/dom'")
  })

  test('strips .tsx server component import', async () => {
    writeFileSync(resolve(COMPONENTS_DIR, 'ServerComp.tsx'), `
export function ServerComp() {
  return <div>server only</div>
}
`)
    const clientJs = `import { ServerComp } from './ServerComp'
import { createSignal } from '@barefootjs/dom'
console.log('client code')
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Parent-abc123.js'), clientJs)

    const manifest = {
      Parent: { clientJs: 'components/Parent-abc123.js', markedTemplate: 'components/Parent.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Parent-abc123.js')).text()
    expect(result).not.toContain('ServerComp')
    expect(result).toContain("from '@barefootjs/dom'")
    expect(result).toContain("console.log('client code')")
  })

  test('deduplicates same module imported by two client JS files', async () => {
    writeFileSync(resolve(COMPONENTS_DIR, 'shared-utils.ts'), `
export const VERSION = '1.0'
`)
    const clientJsA = `import { VERSION } from './shared-utils'
console.log('A', VERSION)
`
    const clientJsB = `import { VERSION } from './shared-utils'
console.log('B', VERSION)
`
    writeFileSync(resolve(COMPONENTS_DIR, 'CompA-aaa.js'), clientJsA)
    writeFileSync(resolve(COMPONENTS_DIR, 'CompB-bbb.js'), clientJsB)

    const manifest = {
      CompA: { clientJs: 'components/CompA-aaa.js', markedTemplate: 'components/CompA.tsx' },
      CompB: { clientJs: 'components/CompB-bbb.js', markedTemplate: 'components/CompB.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const resultA = await Bun.file(resolve(COMPONENTS_DIR, 'CompA-aaa.js')).text()
    const resultB = await Bun.file(resolve(COMPONENTS_DIR, 'CompB-bbb.js')).text()
    // Both should have the inlined code (dedup is per-file, not cross-file)
    expect(resultA).toContain('VERSION')
    expect(resultB).toContain('VERSION')
    expect(resultA).not.toContain("from './shared-utils'")
    expect(resultB).not.toContain("from './shared-utils'")
  })

  test('no-op when no relative imports', async () => {
    const clientJs = `import { createSignal } from '@barefootjs/dom'
const [count, setCount] = createSignal(0)
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Counter-xyz.js'), clientJs)

    const manifest = {
      Counter: { clientJs: 'components/Counter-xyz.js', markedTemplate: 'components/Counter.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Counter-xyz.js')).text()
    expect(result).toBe(clientJs)
  })

  test('strips missing module import without crashing', async () => {
    const clientJs = `import { missing } from './nonexistent'
console.log('still works')
`
    writeFileSync(resolve(COMPONENTS_DIR, 'Broken-111.js'), clientJs)

    const manifest = {
      Broken: { clientJs: 'components/Broken-111.js', markedTemplate: 'components/Broken.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'Broken-111.js')).text()
    expect(result).not.toContain('nonexistent')
    expect(result).toContain("console.log('still works')")
  })

  test('resolves from sourceDirs when not found relative to client JS', async () => {
    // Module exists in SOURCE_DIR, not in COMPONENTS_DIR
    writeFileSync(resolve(SOURCE_DIR, 'helpers.ts'), `
export function formatDate(d: Date): string {
  return d.toISOString()
}
`)
    const clientJs = `import { formatDate } from './helpers'
console.log(formatDate(new Date()))
`
    writeFileSync(resolve(COMPONENTS_DIR, 'DatePicker-fff.js'), clientJs)

    const manifest = {
      DatePicker: { clientJs: 'components/DatePicker-fff.js', markedTemplate: 'components/DatePicker.tsx' },
    }

    await resolveRelativeImports({ distDir: DIST_DIR, manifest, sourceDirs: [SOURCE_DIR] })

    const result = await Bun.file(resolve(COMPONENTS_DIR, 'DatePicker-fff.js')).text()
    expect(result).toContain('function formatDate(d)')
    expect(result).not.toContain("from './helpers'")
  })
})
