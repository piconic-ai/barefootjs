import { describe, test, expect } from 'bun:test'
import {
  toPosixRelative,
  relativeUnderComponentDir,
  withExtension,
  perComponentRelPath,
  buildRelativeImportRewriter,
  safeRollupEntryName,
} from '../paths.ts'

describe('toPosixRelative', () => {
  test('produces a forward-slash relative path', () => {
    expect(toPosixRelative('/proj', '/proj/src/components/Counter.tsx')).toBe('src/components/Counter.tsx')
  })
})

describe('relativeUnderComponentDir', () => {
  test('returns the path under the matching componentDir, with extension', () => {
    expect(relativeUnderComponentDir('/proj/src/components/ui/Button.tsx', ['/proj/src/components'])).toBe(
      'ui/Button.tsx',
    )
  })

  test('falls back to the basename when no componentDir matches', () => {
    expect(relativeUnderComponentDir('/elsewhere/Button.tsx', ['/proj/src/components'])).toBe('Button.tsx')
  })
})

describe('withExtension', () => {
  test('swaps .tsx for the given extension', () => {
    expect(withExtension('ui/Button.tsx', '.tmpl')).toBe('ui/Button.tmpl')
  })

  test('swaps .ts for the given extension', () => {
    expect(withExtension('state.ts', '.ssr-defaults.json')).toBe('state.ssr-defaults.json')
  })
})

describe('perComponentRelPath', () => {
  test('names the file after the component, in the same directory', () => {
    expect(perComponentRelPath('ui/toast/index.tsx', 'Toast', '.tmpl')).toBe('ui/toast/Toast.tmpl')
  })

  test('handles a top-level file with no subdirectory', () => {
    expect(perComponentRelPath('Button.tsx', 'Button', '.tmpl')).toBe('Button.tmpl')
  })
})

describe('buildRelativeImportRewriter', () => {
  test('re-anchors an import to a sibling still under componentDirs', () => {
    const rewrite = buildRelativeImportRewriter(
      '/proj/src/components/ui/button/index.tsx',
      '/views/ui/button/index.tmpl',
      ['/proj/src/components'],
      '/views',
    )
    expect(rewrite('../slot')).toBe('../slot')
  })

  test('re-relativises an import to a file outside componentDirs from the new output position', () => {
    const rewrite = buildRelativeImportRewriter(
      '/proj/src/components/ui/button/index.tsx',
      '/views/ui/button/index.tmpl',
      ['/proj/src/components'],
      '/views',
    )
    // '../../../types' from the source resolves to /proj/src/types — the
    // shared file didn't move, only the template's own position did, so
    // the rewritten specifier re-relativises from the template's new home
    // (/views/ui/button/) back to that same absolute file.
    expect(rewrite('../../../types')).toBe('../../../proj/src/types')
  })
})

describe('safeRollupEntryName', () => {
  test('uses the plain root-relative path when the file is under root', () => {
    expect(safeRollupEntryName('/proj', '/proj/src/components/Counter.tsx', ['/proj/src/components'])).toBe(
      'src/components/Counter.tsx',
    )
  })

  test('falls back to the componentDir-relative path when the file is OUTSIDE root (a `..`-prefixed name Rollup rejects as [name])', () => {
    expect(
      safeRollupEntryName('/proj/gin', '/proj/shared/blog/LikeButton.tsx', ['/proj/shared/blog']),
    ).toBe('LikeButton.tsx')
  })

  test('the out-of-root fallback never starts with ".." (what Rollup actually rejects)', () => {
    const name = safeRollupEntryName('/proj/gin', '/proj/shared/blog/nested/LikeButton.tsx', ['/proj/shared/blog'])
    expect(name.startsWith('..')).toBe(false)
    expect(name).toBe('nested/LikeButton.tsx')
  })
})
