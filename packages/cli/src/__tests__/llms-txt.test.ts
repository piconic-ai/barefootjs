import { describe, test, expect } from 'bun:test'
import path from 'path'
import { generateCoreLlmsTxt, generateUiLlmsTxt } from '../lib/llms-txt-generator'
import { scanCoreDocs } from '../lib/docs-loader'
import { loadIndex } from '../lib/meta-loader'
import type { MetaIndex } from '../lib/types'

const docsDir = path.resolve(import.meta.dir, '../../../../docs/core')
const metaDir = path.resolve(import.meta.dir, '../../../../ui/meta')

describe('generateCoreLlmsTxt', () => {
  test('generates valid llms.txt with H1, blockquote, and sections', () => {
    const docs = scanCoreDocs(docsDir)
    const result = generateCoreLlmsTxt(docs, 'https://barefootjs.dev/docs')

    expect(result).toContain('# BarefootJS')
    expect(result).toContain('> JSX')
    expect(result).toContain('## Reactivity')
    expect(result).toContain('## Components')
  })

  test('groups docs by category', () => {
    const docs = scanCoreDocs(docsDir)
    const result = generateCoreLlmsTxt(docs, 'https://barefootjs.dev/docs')

    expect(result).toContain('## Reactivity')
    expect(result).toContain('## Advanced')
    expect(result).toContain('## Adapters')
  })

  test('includes title and description for each entry', () => {
    const docs = scanCoreDocs(docsDir)
    const result = generateCoreLlmsTxt(docs, 'https://barefootjs.dev/docs')

    // Should have markdown links
    expect(result).toMatch(/\[.+\]\(https:\/\/barefootjs\.dev\/docs\/.+\.md\)/)
  })

  test('uses correct URLs with baseUrl', () => {
    const docs = scanCoreDocs(docsDir)
    const result = generateCoreLlmsTxt(docs, 'https://custom.dev/docs')

    expect(result).toContain('https://custom.dev/docs/')
    expect(result).not.toContain('https://barefootjs.dev')
  })

  test('skips overview (root-level) docs', () => {
    const docs = scanCoreDocs(docsDir)
    const result = generateCoreLlmsTxt(docs, 'https://barefootjs.dev/docs')

    // Root-level section index pages should not appear as links
    // (they have category "overview")
    expect(result).not.toContain('(https://barefootjs.dev/docs/introduction.md)')
  })
})

describe('generateUiLlmsTxt', () => {
  test('generates valid llms.txt from MetaIndex', () => {
    const index = loadIndex(metaDir)
    const result = generateUiLlmsTxt(index, 'https://ui.barefootjs.dev/components')

    expect(result).toContain('# BarefootJS UI')
    expect(result).toContain('> Signal-based UI')
  })

  test('groups components by category', () => {
    const index = loadIndex(metaDir)
    const result = generateUiLlmsTxt(index, 'https://ui.barefootjs.dev/components')

    expect(result).toContain('## Input')
    expect(result).toContain('## Display')
  })

  test('marks stateful components', () => {
    const index = loadIndex(metaDir)
    const result = generateUiLlmsTxt(index, 'https://ui.barefootjs.dev/components')

    // At least some components should be marked stateful
    expect(result).toContain('(stateful)')
  })

  test('handles empty index', () => {
    const emptyIndex: MetaIndex = { version: 1, generatedAt: '', components: [] }
    const result = generateUiLlmsTxt(emptyIndex, 'https://ui.barefootjs.dev/components')

    expect(result).toContain('# BarefootJS UI')
    // No sections beyond header
    expect(result).not.toContain('## ')
  })
})
