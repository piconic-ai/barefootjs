import { describe, test, expect } from 'bun:test'
import { resolve } from 'node:path'
import { effectiveNamesFor, effectiveOutName } from '../lib/build'

describe('effectiveNamesFor', () => {
  test('flat file under componentDirs preserves bare basename', () => {
    const cwd = process.cwd()
    expect(effectiveNamesFor(resolve(cwd, 'components/Counter.tsx'), ['components'])).toEqual({
      baseFileName: 'Counter.tsx',
      baseNameNoExt: 'Counter',
    })
  })

  test('nested index.tsx preserves the full subdir path', () => {
    const cwd = process.cwd()
    expect(
      effectiveNamesFor(resolve(cwd, 'components/ui/button/index.tsx'), ['components']),
    ).toEqual({
      baseFileName: 'ui/button/index.tsx',
      baseNameNoExt: 'ui/button/index',
    })
  })

  test('nested non-index file preserves subdir + basename', () => {
    const cwd = process.cwd()
    expect(
      effectiveNamesFor(resolve(cwd, 'components/forms/Input.tsx'), ['components']),
    ).toEqual({
      baseFileName: 'forms/Input.tsx',
      baseNameNoExt: 'forms/Input',
    })
  })

  test('out-of-tree path falls back to plain basename', () => {
    expect(effectiveNamesFor('/elsewhere/Counter.tsx', ['components'])).toEqual({
      baseFileName: 'Counter.tsx',
      baseNameNoExt: 'Counter',
    })
  })

  test('no componentDirs falls back to plain basename', () => {
    expect(effectiveNamesFor('/anywhere/Counter.tsx')).toEqual({
      baseFileName: 'Counter.tsx',
      baseNameNoExt: 'Counter',
    })
  })

  test('walks multiple componentDirs and uses the matching one', () => {
    const cwd = process.cwd()
    expect(
      effectiveNamesFor(resolve(cwd, 'shared/Footer.tsx'), ['components', 'shared']),
    ).toEqual({
      baseFileName: 'Footer.tsx',
      baseNameNoExt: 'Footer',
    })
  })
})

describe('effectiveOutName', () => {
  test('flat entry: returns plain basename', () => {
    expect(effectiveOutName('/abs/components/Counter.tsx', 'Counter')).toBe('Counter.tsx')
  })

  test('nested entry: prefixes the subdir from entryBaseNoExt', () => {
    expect(effectiveOutName('/abs/components/ui/button/index.tsx', 'ui/button/index')).toBe(
      'ui/button/index.tsx',
    )
  })

  test('nested entry with multi-template basename: keeps template basename, splices subdir', () => {
    expect(
      effectiveOutName('/abs/components/ui/button/index.client.tsx', 'ui/button/index'),
    ).toBe('ui/button/index.client.tsx')
  })
})
