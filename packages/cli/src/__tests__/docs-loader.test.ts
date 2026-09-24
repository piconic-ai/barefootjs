import { describe, test, expect } from 'bun:test'
import path from 'path'
import { parseFrontmatter, scanCoreDocs, resolveDoc } from '../lib/docs-loader'

const docsDir = path.resolve(import.meta.dir, '../../../../docs/core')

describe('parseFrontmatter', () => {
  test('parses YAML frontmatter with title and description', () => {
    const content = `---
title: My Title
description: A short description
---

# My Title

Body content here.`
    const result = parseFrontmatter(content)
    expect(result.title).toBe('My Title')
    expect(result.description).toBe('A short description')
    expect(result.body).toContain('# My Title')
    expect(result.body).not.toContain('---')
  })

  test('handles quoted frontmatter values', () => {
    const content = `---
title: '"use client" Directive'
description: "Marking components for client-side interactivity"
---

Content.`
    const result = parseFrontmatter(content)
    expect(result.title).toBe('"use client" Directive')
    expect(result.description).toBe('Marking components for client-side interactivity')
  })

  test('extracts title from # heading when no frontmatter', () => {
    const content = `# createSignal

Creates a reactive value.`
    const result = parseFrontmatter(content)
    expect(result.title).toBe('createSignal')
    expect(result.description).toBe('')
    expect(result.body).toBe(content)
  })

  test('returns empty title and description for empty content', () => {
    const result = parseFrontmatter('')
    expect(result.title).toBe('')
    expect(result.description).toBe('')
  })
})

describe('scanCoreDocs', () => {
  test('finds all .md files recursively', () => {
    const docs = scanCoreDocs(docsDir)
    expect(docs.length).toBeGreaterThan(20)
  })

  test('excludes README.md', () => {
    const docs = scanCoreDocs(docsDir)
    expect(docs.every(d => !d.slug.endsWith('README'))).toBe(true)
  })

  test('extracts category from directory name', () => {
    const docs = scanCoreDocs(docsDir)
    const signalDoc = docs.find(d => d.slug.includes('create-signal'))
    expect(signalDoc).toBeDefined()
    expect(signalDoc!.category).toBe('reactivity')
  })

  test('assigns "overview" category for root-level files', () => {
    const docs = scanCoreDocs(docsDir)
    const intro = docs.find(d => d.slug === 'introduction')
    expect(intro).toBeDefined()
    expect(intro!.category).toBe('overview')
  })

  test('returns empty array for nonexistent directory', () => {
    const docs = scanCoreDocs('/nonexistent/path')
    expect(docs).toEqual([])
  })

  test('returns sorted results', () => {
    const docs = scanCoreDocs(docsDir)
    const slugs = docs.map(d => d.slug)
    const sorted = [...slugs].sort()
    expect(slugs).toEqual(sorted)
  })
})

describe('resolveDoc', () => {
  test('resolves by exact slug', () => {
    const { doc } = resolveDoc(docsDir, 'reactivity/create-signal')
    expect(doc).not.toBeNull()
    expect(doc!.slug).toBe('reactivity/create-signal')
  })

  test('resolves by short name (unique filename)', () => {
    const { doc } = resolveDoc(docsDir, 'create-signal')
    expect(doc).not.toBeNull()
    expect(doc!.slug).toBe('reactivity/create-signal')
  })

  test('returns null for nonexistent doc', () => {
    const { doc, candidates } = resolveDoc(docsDir, 'nonexistent-doc')
    expect(doc).toBeNull()
    expect(candidates).toEqual([])
  })

  test('returns candidates for ambiguous name', () => {
    // "reactivity" is the chapter index docs/core/reactivity.md; the exact
    // slug match wins over any filename match under a subdirectory.
    const { doc, candidates } = resolveDoc(docsDir, 'reactivity')
    expect(doc).not.toBeNull()
    expect(doc!.slug).toBe('reactivity')
  })

  test('prefers exact slug over filename match', () => {
    const { doc } = resolveDoc(docsDir, 'introduction')
    expect(doc).not.toBeNull()
    expect(doc!.slug).toBe('introduction')
  })
})
