// `resolveComponentSource` is the shared lookup behind `bf debug graph`,
// `bf debug signals`, `bf debug trace`, and `bf debug fallbacks`. The
// scaffold puts the user's own components at `components/<Name>.tsx`
// (top of the source dir) while registry items land under
// `components/ui/<name>/index.tsx`. This suite pins both layouts plus
// the `searched` transcript so the matching CLI error message stays
// honest about where it actually looked.

import { describe, test, expect } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { resolveComponentSource } from '../lib/resolve-source'
import type { CliContext } from '../context'

function mktmp(): string {
  return mkdtempSync(path.join(tmpdir(), 'bf-resolve-source-'))
}

function ctxFor(projectDir: string, sourceDirs: string[] = []): CliContext {
  return {
    root: projectDir, // no monorepo above the tmp dir — `ui/components/ui` won't exist
    metaDir: path.join(projectDir, 'meta'),
    jsonFlag: false,
    config: {
      paths: { components: 'components/ui', tokens: 'tokens', meta: 'meta' },
      sourceDirs,
    },
    projectDir,
  }
}

describe('resolveComponentSource', () => {
  test('finds a top-level scaffold component via sourceDirs (components/Counter.tsx)', () => {
    // Mirrors the scaffold layout: `barefoot.config.ts` has
    // `components: ['components']`, the user's Counter.tsx lives at the
    // root of that dir. The pre-fix resolver only searched
    // `paths.components` (i.e. `components/ui/`) and missed it.
    const projectDir = mktmp()
    mkdirSync(path.join(projectDir, 'components'), { recursive: true })
    writeFileSync(path.join(projectDir, 'components', 'Counter.tsx'), 'export {}')
    try {
      const searched: string[] = []
      const r = resolveComponentSource('Counter', ctxFor(projectDir, ['components']), searched)
      expect(r).not.toBeNull()
      expect(r!.filePath).toBe(path.join(projectDir, 'components', 'Counter.tsx'))
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test('finds a registry-style component under paths.components/<name>/index.tsx', () => {
    const projectDir = mktmp()
    mkdirSync(path.join(projectDir, 'components', 'ui', 'button'), { recursive: true })
    writeFileSync(path.join(projectDir, 'components', 'ui', 'button', 'index.tsx'), 'export {}')
    try {
      const r = resolveComponentSource('button', ctxFor(projectDir))
      expect(r).not.toBeNull()
      expect(r!.filePath).toBe(path.join(projectDir, 'components', 'ui', 'button', 'index.tsx'))
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test('case-insensitive fallback resolves `counter` → components/Counter.tsx', () => {
    // The scaffold quick-start invites `bf docs <component>` with a
    // lowercase placeholder. Users naturally type `bf docs counter`
    // even though the on-disk file is PascalCase `Counter.tsx`. On
    // case-sensitive filesystems (Linux/CI) the pre-fix resolver
    // missed it; now it falls back to a directory scan.
    const projectDir = mktmp()
    mkdirSync(path.join(projectDir, 'components'), { recursive: true })
    writeFileSync(path.join(projectDir, 'components', 'Counter.tsx'), 'export {}')
    try {
      const r = resolveComponentSource('counter', ctxFor(projectDir, ['components']))
      expect(r).not.toBeNull()
      expect(r!.filePath).toBe(path.join(projectDir, 'components', 'Counter.tsx'))
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test('case-insensitive fallback resolves nested registry entry `Button` → components/ui/button/index.tsx', () => {
    const projectDir = mktmp()
    mkdirSync(path.join(projectDir, 'components', 'ui', 'button'), { recursive: true })
    writeFileSync(path.join(projectDir, 'components', 'ui', 'button', 'index.tsx'), 'export {}')
    try {
      const r = resolveComponentSource('Button', ctxFor(projectDir))
      expect(r).not.toBeNull()
      expect(r!.filePath).toBe(path.join(projectDir, 'components', 'ui', 'button', 'index.tsx'))
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test('ambiguous case-insensitive match → bail (do not pick one nondeterministically)', () => {
    // Case-sensitive filesystems can legally hold `Counter.tsx` AND
    // `counter.tsx` side by side. A mixed-case query (`cOuNtEr`) hits
    // *both* under case-insensitive comparison; returning either one
    // would be `readdirSync`-order roulette. Verify we bail to null so
    // the caller surfaces the conflict via the regular not-found path.
    const projectDir = mktmp()
    mkdirSync(path.join(projectDir, 'components'), { recursive: true })
    writeFileSync(path.join(projectDir, 'components', 'Counter.tsx'), 'export {}')
    writeFileSync(path.join(projectDir, 'components', 'counter.tsx'), 'export {}')
    try {
      const r = resolveComponentSource('cOuNtEr', ctxFor(projectDir, ['components']))
      expect(r).toBeNull()
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test('exact-case match still wins over a case-insensitive sibling', () => {
    // If both `Counter.tsx` and `counter.tsx` somehow coexist
    // (Counter wins in case-sensitive lookup), the resolver must
    // return the exact-case file — no scan-driven surprise swap.
    const projectDir = mktmp()
    mkdirSync(path.join(projectDir, 'components'), { recursive: true })
    writeFileSync(path.join(projectDir, 'components', 'Counter.tsx'), 'export {}')
    writeFileSync(path.join(projectDir, 'components', 'counter.tsx'), 'export {}')
    try {
      const r = resolveComponentSource('Counter', ctxFor(projectDir, ['components']))
      expect(r!.filePath).toBe(path.join(projectDir, 'components', 'Counter.tsx'))
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test('falls back to index.preview.tsx for a preview-only monorepo entry (#1849 B5)', () => {
    // `settings-form` ships only index.preview.tsx (no index.tsx). The resolver
    // must resolve it to the preview and flag `isPreview` so the caller can note
    // it, rather than erroring with "Cannot find component".
    const projectDir = mktmp()
    const compDir = path.join(projectDir, 'ui/components/ui/settings-form')
    mkdirSync(compDir, { recursive: true })
    writeFileSync(path.join(compDir, 'index.preview.tsx'), 'export function Default() { return null }')
    try {
      const r = resolveComponentSource('settings-form', ctxFor(projectDir))
      expect(r).not.toBeNull()
      expect(r!.filePath).toBe(path.join(compDir, 'index.preview.tsx'))
      expect(r!.isPreview).toBe(true)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test('prefers index.tsx over index.preview.tsx when both exist', () => {
    const projectDir = mktmp()
    const compDir = path.join(projectDir, 'ui/components/ui/dialog')
    mkdirSync(compDir, { recursive: true })
    writeFileSync(path.join(compDir, 'index.tsx'), 'export {}')
    writeFileSync(path.join(compDir, 'index.preview.tsx'), 'export {}')
    try {
      const r = resolveComponentSource('dialog', ctxFor(projectDir))
      expect(r!.filePath).toBe(path.join(compDir, 'index.tsx'))
      expect(r!.isPreview).toBeUndefined()
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test('returns null and populates `searched` with every candidate it tried', () => {
    // Drives the "Looked in:" error transcript surfaced by the debug
    // commands when the user types an unknown component name.
    const projectDir = mktmp()
    try {
      const searched: string[] = []
      const r = resolveComponentSource('NoSuchComponent', ctxFor(projectDir, ['components']), searched)
      expect(r).toBeNull()
      expect(searched.length).toBeGreaterThan(0)
      // Includes both paths.components and the sourceDirs layout.
      expect(searched.some(p => p.endsWith('/components/ui/NoSuchComponent/index.tsx'))).toBe(true)
      expect(searched.some(p => p.endsWith('/components/NoSuchComponent.tsx'))).toBe(true)
      // Does NOT include the monorepo `ui/components/ui/...` path —
      // that's a confusing no-op outside the monorepo.
      expect(searched.some(p => p.includes('/ui/components/ui/'))).toBe(false)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })
})
