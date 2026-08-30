import { describe, test, expect, afterEach } from 'bun:test'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildChildNameIndex,
  computeClientEntryPaths,
  hasUseClientDirective,
  discoverComponentFiles,
  discoverComponents,
} from '../discover.ts'

describe('hasUseClientDirective', () => {
  test('detects a leading double-quoted directive', () => {
    expect(hasUseClientDirective('"use client"\nexport function A() {}')).toBe(true)
  })

  test('detects a leading single-quoted directive', () => {
    expect(hasUseClientDirective("'use client'\nexport function A() {}")).toBe(true)
  })

  test('skips leading block comments before the directive', () => {
    expect(hasUseClientDirective('/* c */\n\'use client\'\nexport function A() {}')).toBe(true)
  })

  test('skips leading line comments before the directive', () => {
    expect(hasUseClientDirective('// c\n\'use client\'\nexport function A() {}')).toBe(true)
  })

  test('returns false for a server-only file', () => {
    expect(hasUseClientDirective('export function A() { return <div/> }')).toBe(false)
  })

  test('returns false when the directive is not the first statement', () => {
    expect(hasUseClientDirective('const x = 1\n\'use client\'')).toBe(false)
  })
})

describe('discoverComponentFiles', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('finds nested .tsx files and skips test/spec/preview variants', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-discover-'))
    await mkdir(join(dir, 'nested'), { recursive: true })
    await writeFile(join(dir, 'A.tsx'), 'export function A() {}')
    await writeFile(join(dir, 'A.test.tsx'), 'export function A() {}')
    await writeFile(join(dir, 'A.spec.tsx'), 'export function A() {}')
    await writeFile(join(dir, 'A.preview.tsx'), 'export function A() {}')
    await writeFile(join(dir, 'nested', 'B.tsx'), 'export function B() {}')
    await writeFile(join(dir, 'not-a-component.ts'), 'export const x = 1')

    const found = await discoverComponentFiles(dir)
    const basenames = found.map(f => f.slice(dir.length + 1)).sort()
    expect(basenames).toEqual(['A.tsx', 'nested/B.tsx'])
  })

  test('returns an empty array for a missing directory', async () => {
    const found = await discoverComponentFiles(join(tmpdir(), 'does-not-exist-barefoot-vite'))
    expect(found).toEqual([])
  })
})

describe('discoverComponents', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('classifies each discovered file as client or server-only', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-discover-classify-'))
    await writeFile(join(dir, 'Client.tsx'), '\'use client\'\nexport function Client() {}')
    await writeFile(join(dir, 'Server.tsx'), 'export function Server() {}')

    const found = await discoverComponents([dir], p => Bun.file(p).text())
    const byName = Object.fromEntries(found.map(f => [f.absPath.slice(dir.length + 1), f.isClient]))
    expect(byName['Client.tsx']).toBe(true)
    expect(byName['Server.tsx']).toBe(false)
  })

  // #2767: a plain server file that renders a 'use client' descendant needs
  // its OWN client bundle too — it's the file whose compiled init actually
  // owns the `initChild(...)` call reaching that descendant. Exercises the
  // analyzer scan (`scanComponentFile`) + `computeClientEntryPaths` closure
  // end to end, on real files, not fabricated rows.
  test('a server parent that renders a client child needs its own client entry', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-discover-entry-'))
    await writeFile(join(dir, 'Child.tsx'), '\'use client\'\nexport function Child() { return <span/> }')
    await writeFile(
      join(dir, 'Parent.tsx'),
      "import { Child } from './Child'\nexport function Parent() { return <div><Child/></div> }",
    )
    await writeFile(join(dir, 'Leaf.tsx'), 'export function Leaf() { return <span/> }')

    const found = await discoverComponents([dir], p => Bun.file(p).text())
    const byName = Object.fromEntries(found.map(f => [f.absPath.slice(dir.length + 1), f.needsClientEntry]))
    expect(byName['Child.tsx']).toBe(true)
    expect(byName['Parent.tsx']).toBe(true)
    expect(byName['Leaf.tsx']).toBe(false)
  })
})

describe('computeClientEntryPaths', () => {
  test('a server parent that directly references a client child needs its own entry', () => {
    const rows = [
      { absPath: '/proj/Parent.tsx', isClient: false, exportedComponents: ['Parent'], referencedComponents: ['Child'] },
      { absPath: '/proj/Child.tsx', isClient: true, exportedComponents: ['Child'], referencedComponents: [] },
    ]
    const entries = computeClientEntryPaths(rows)
    expect(entries.has('/proj/Parent.tsx')).toBe(true)
    expect(entries.has('/proj/Child.tsx')).toBe(true)
  })

  // A parent-of-client-only fix would miss this: every server file on the
  // path from the SSR root down to the client descendant must ship its own
  // bundle, since each one owns the `initChild` call reaching the next.
  test('walks the transitive chain all the way up from a deeply nested client component', () => {
    const rows = [
      { absPath: '/proj/GreatGrand.tsx', isClient: false, exportedComponents: ['GreatGrand'], referencedComponents: ['Grandparent'] },
      { absPath: '/proj/Grandparent.tsx', isClient: false, exportedComponents: ['Grandparent'], referencedComponents: ['Parent'] },
      { absPath: '/proj/Parent.tsx', isClient: false, exportedComponents: ['Parent'], referencedComponents: ['Child'] },
      { absPath: '/proj/Child.tsx', isClient: true, exportedComponents: ['Child'], referencedComponents: [] },
    ]
    const entries = computeClientEntryPaths(rows)
    expect(entries.has('/proj/GreatGrand.tsx')).toBe(true)
    expect(entries.has('/proj/Grandparent.tsx')).toBe(true)
    expect(entries.has('/proj/Parent.tsx')).toBe(true)
    expect(entries.has('/proj/Child.tsx')).toBe(true)
  })

  // The anti-regression: an all-server tree with zero client descendants
  // anywhere must produce ZERO entries. A `analyzeClientNeeds(ir).needsInit`
  // predicate would get this wrong (it's true for StaticParent purely
  // because it references ServerChild at all) — this is exactly why the
  // closure is seeded from `isClient`, not from the compiler's per-file
  // "needs init" signal.
  test('an all-server tree with no client descendants produces no entries at all', () => {
    const rows = [
      { absPath: '/proj/StaticParent.tsx', isClient: false, exportedComponents: ['StaticParent'], referencedComponents: ['ServerChild'] },
      { absPath: '/proj/ServerChild.tsx', isClient: false, exportedComponents: ['ServerChild'], referencedComponents: [] },
    ]
    const entries = computeClientEntryPaths(rows)
    expect(entries.size).toBe(0)
  })

  test('a server leaf with no component references is never an entry', () => {
    const rows = [
      { absPath: '/proj/Leaf.tsx', isClient: false, exportedComponents: ['Leaf'], referencedComponents: [] },
    ]
    expect(computeClientEntryPaths(rows).size).toBe(0)
  })

  // Cycle-safety: a mutual server↔server reference must terminate and stay
  // empty; adding a client component into the cycle must pull in every
  // member reachable from it, not just the one that references it directly.
  test('is cycle-safe and still finds every member of a cycle once one member is a client entry', () => {
    const allServer = [
      { absPath: '/proj/A.tsx', isClient: false, exportedComponents: ['A'], referencedComponents: ['B'] },
      { absPath: '/proj/B.tsx', isClient: false, exportedComponents: ['B'], referencedComponents: ['A'] },
    ]
    expect(computeClientEntryPaths(allServer).size).toBe(0)

    const withClientMember = [
      { absPath: '/proj/A.tsx', isClient: false, exportedComponents: ['A'], referencedComponents: ['B', 'C'] },
      { absPath: '/proj/B.tsx', isClient: false, exportedComponents: ['B'], referencedComponents: ['A'] },
      { absPath: '/proj/C.tsx', isClient: true, exportedComponents: ['C'], referencedComponents: [] },
    ]
    const entries = computeClientEntryPaths(withClientMember)
    expect(entries.has('/proj/A.tsx')).toBe(true)
    expect(entries.has('/proj/B.tsx')).toBe(true)
    expect(entries.has('/proj/C.tsx')).toBe(true)
  })

  test('resolves a reference through a multi-export file, same as buildChildNameIndex', () => {
    const rows = [
      { absPath: '/proj/Parent.tsx', isClient: false, exportedComponents: ['Parent'], referencedComponents: ['CopyIcon'] },
      { absPath: '/proj/icon/index.tsx', isClient: true, exportedComponents: ['CopyIcon', 'CheckIcon'], referencedComponents: [] },
    ]
    const entries = computeClientEntryPaths(rows)
    expect(entries.has('/proj/Parent.tsx')).toBe(true)
    expect(entries.has('/proj/icon/index.tsx')).toBe(true)
  })

  test('an unresolved tag name (e.g. a third-party import) is ignored, not a crash', () => {
    const rows = [
      { absPath: '/proj/Parent.tsx', isClient: false, exportedComponents: ['Parent'], referencedComponents: ['SomeExternalLib'] },
    ]
    expect(() => computeClientEntryPaths(rows)).not.toThrow()
    expect(computeClientEntryPaths(rows).size).toBe(0)
  })
})

describe('buildChildNameIndex', () => {
  test('keys \'use client\' files by their exported component names', () => {
    const index = buildChildNameIndex([
      { absPath: '/proj/components/TodoItem.tsx', needsClientEntry: true, exportedComponents: ['TodoItem'] },
      { absPath: '/proj/blog/LikeButton.tsx', needsClientEntry: true, exportedComponents: ['LikeButton'] },
    ])
    expect(index.get('TodoItem')).toBe('/proj/components/TodoItem.tsx')
    expect(index.get('LikeButton')).toBe('/proj/blog/LikeButton.tsx')
  })

  // The regression this index was rebuilt for. Keyed on the basename, an
  // `index.tsx` exporting several components resolved only as `index`, so
  // every `@bf-child:<Name>` marker into it fell through to the no-op
  // module and the child silently never hydrated.
  test('a file exporting several components is reachable by EVERY name, not by its basename', () => {
    const index = buildChildNameIndex([
      {
        absPath: '/proj/components/icon/index.tsx',
        needsClientEntry: true,
        exportedComponents: ['CopyIcon', 'CheckIcon'],
      },
    ])
    expect(index.get('CopyIcon')).toBe('/proj/components/icon/index.tsx')
    expect(index.get('CheckIcon')).toBe('/proj/components/icon/index.tsx')
    expect(index.has('index')).toBe(false)
  })

  // Wider than the multi-export case: keyed on the basename, EVERY
  // colocated `index.tsx` collided on the single key "index" — so even a
  // single-export `ui/button/index.tsx` was unreachable as a marker target.
  test('single-export colocated index.tsx files resolve by name, and never collide on "index"', () => {
    const index = buildChildNameIndex([
      { absPath: '/proj/ui/button/index.tsx', needsClientEntry: true, exportedComponents: ['Button'] },
      { absPath: '/proj/ui/toggle/index.tsx', needsClientEntry: true, exportedComponents: ['Toggle'] },
    ])
    expect(index.get('Button')).toBe('/proj/ui/button/index.tsx')
    expect(index.get('Toggle')).toBe('/proj/ui/toggle/index.tsx')
    expect(index.has('index')).toBe(false)
  })

  test('first writer wins on a duplicate name, so an earlier components dir shadows a later one', () => {
    const index = buildChildNameIndex([
      { absPath: '/proj/a/Button.tsx', needsClientEntry: true, exportedComponents: ['Button'] },
      { absPath: '/proj/b/Button.tsx', needsClientEntry: true, exportedComponents: ['Button'] },
    ])
    expect(index.get('Button')).toBe('/proj/a/Button.tsx')
  })

  test('falls back to the basename when no exports were parsed, keeping the old convention working', () => {
    const index = buildChildNameIndex([
      { absPath: '/proj/components/Widget.tsx', needsClientEntry: true, exportedComponents: [] },
    ])
    expect(index.get('Widget')).toBe('/proj/components/Widget.tsx')
  })

  test('excludes files that need no client entry — a @bf-child marker only ever names a component whose bundle ships', () => {
    const index = buildChildNameIndex([
      { absPath: '/proj/components/ServerOnly.tsx', needsClientEntry: false, exportedComponents: [] },
    ])
    expect(index.has('ServerOnly')).toBe(false)
  })

  // #2767: `needsClientEntry`, not `isClient`, decides indexability — a
  // plain server file that owns a 'use client' descendant is a legitimate
  // `@bf-child:` marker target too, because IT is the file whose compiled
  // init contains the `initChild(...)` call reaching that descendant.
  test('indexes a server-only file whose subtree owns a client descendant (needsClientEntry: true)', () => {
    const index = buildChildNameIndex([
      { absPath: '/proj/components/ServerParent.tsx', needsClientEntry: true, exportedComponents: ['ServerParent'] },
    ])
    expect(index.get('ServerParent')).toBe('/proj/components/ServerParent.tsx')
  })

  test('accepts a .ts extension too', () => {
    const index = buildChildNameIndex([
      { absPath: '/proj/components/Widget.ts', needsClientEntry: true, exportedComponents: ['Widget'] },
    ])
    expect(index.get('Widget')).toBe('/proj/components/Widget.ts')
  })
})
