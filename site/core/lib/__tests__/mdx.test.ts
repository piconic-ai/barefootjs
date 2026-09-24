import { describe, test, expect, beforeAll } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderMdx, projectMdxToMarkdown, defaultMdxProjectors } from '../mdx'
import { initHighlighter } from '../markdown'

const DOCS_ROOT = resolve(import.meta.dir, '../../../../docs/core')

const QUICK_START_MDX = readFileSync(resolve(DOCS_ROOT, 'quick-start.mdx'), 'utf-8')
const INTRODUCTION_MDX = readFileSync(resolve(DOCS_ROOT, 'introduction.mdx'), 'utf-8')
const HOW_IT_WORKS_MDX = readFileSync(resolve(DOCS_ROOT, 'how-it-works.mdx'), 'utf-8')
const README_MDX = readFileSync(resolve(DOCS_ROOT, 'README.mdx'), 'utf-8')

beforeAll(async () => {
  await initHighlighter()
})

describe('renderMdx (quick-start)', () => {
  test('extracts frontmatter from the .mdx source', async () => {
    const result = await renderMdx(QUICK_START_MDX)
    expect(result.frontmatter.title).toBe('Quick Start')
    expect(result.frontmatter.description).toContain('Scaffold a BarefootJS app')
  })

  test('produces an HTML/component/HTML interleaving with the tabs in the middle', async () => {
    const result = await renderMdx(QUICK_START_MDX)
    expect(result.parts.map((p) => p.type)).toEqual(['html', 'component', 'html'])
    const tabs = result.parts.find((p) => p.type === 'component')!
    expect(tabs).toEqual({
      type: 'component',
      name: 'PackageManagerTabs',
      props: { command: 'barefootjs@latest', mode: 'create' },
    })
  })

  test('emits a TOC entry for every H2 in the .mdx body', async () => {
    const result = await renderMdx(QUICK_START_MDX)
    const titles = result.toc.map((t) => t.title)
    expect(titles).toEqual([
      'Prerequisites',
      '1. Scaffold the project',
      '2. Install and run',
      '3. Look at what was generated',
      '4. Make a change',
      '5. Deploy (optional)',
      'Next steps',
    ])
  })

  test('the rendered HTML chunks never contain the raw JSX tag', async () => {
    const result = await renderMdx(QUICK_START_MDX)
    for (const part of result.parts) {
      if (part.type === 'html') {
        expect(part.html).not.toContain('<PackageManagerTabs')
      }
    }
  })
})

describe('projectMdxToMarkdown (quick-start)', () => {
  test('round-trips the .mdx to plain markdown with the npm-create code block', () => {
    const projected = projectMdxToMarkdown(QUICK_START_MDX, defaultMdxProjectors)
    expect(projected.startsWith('---\ntitle: Quick Start\n')).toBe(true)
    expect(projected).toContain('```bash\nnpm create barefootjs@latest\n```')
    expect(projected).not.toContain('<PackageManagerTabs')
  })

  test('preserves every H2 from the .mdx body', () => {
    const projected = projectMdxToMarkdown(QUICK_START_MDX, defaultMdxProjectors)
    const headings = projected.match(/^##\s+.+$/gm) ?? []
    expect(headings).toEqual([
      '## Prerequisites',
      '## 1. Scaffold the project',
      '## 2. Install and run',
      '## 3. Look at what was generated',
      '## 4. Make a change',
      '## 5. Deploy (optional)',
      '## Next steps',
    ])
  })
})

// --- Phase 2 per-page tests ---

describe('renderMdx (introduction)', () => {
  test('extracts frontmatter', async () => {
    const result = await renderMdx(INTRODUCTION_MDX)
    expect(result.frontmatter.title).toBe('Introduction')
  })

  test('produces HTML / block-component / HTML interleaving', async () => {
    const result = await renderMdx(INTRODUCTION_MDX)
    const types = result.parts.map((p) => p.type)
    expect(types).toContain('html')
    expect(types).toContain('block-component')
  })

  test('block-component has two adapter tabs', async () => {
    const result = await renderMdx(INTRODUCTION_MDX)
    const block = result.parts.find((p) => p.type === 'block-component')!
    expect(block.type).toBe('block-component')
    if (block.type === 'block-component') {
      expect(block.name).toBe('Tabs')
      expect(block.children).toHaveLength(2)
      expect(block.children[0].props.label).toBe('Hono')
      expect(block.children[1].props.label).toBe('Go Template')
      expect(block.children[0].html).toContain('<pre')
      expect(block.children[1].html).toContain('<pre')
    }
  })

  test('rendered HTML never contains raw JSX tags', async () => {
    const result = await renderMdx(INTRODUCTION_MDX)
    for (const part of result.parts) {
      if (part.type === 'html') {
        expect(part.html).not.toContain('<Tabs')
        expect(part.html).not.toContain('<Tab ')
      }
    }
  })
})

describe('projectMdxToMarkdown (introduction)', () => {
  test('projects to plain markdown with default (Hono) tab content', () => {
    const projected = projectMdxToMarkdown(INTRODUCTION_MDX, defaultMdxProjectors)
    expect(projected.startsWith('---\ntitle: Introduction\n')).toBe(true)
    expect(projected).toContain('bfText("s0")')
    expect(projected).not.toContain('<Tabs')
    expect(projected).not.toContain('<Tab ')
    expect(projected).not.toContain('<!-- tabs')
  })

  test('preserves H2 headings', () => {
    const projected = projectMdxToMarkdown(INTRODUCTION_MDX, defaultMdxProjectors)
    expect(projected).toContain('## What is BarefootJS?')
  })
})

describe('renderMdx (how-it-works)', () => {
  test('extracts frontmatter', async () => {
    const result = await renderMdx(HOW_IT_WORKS_MDX)
    expect(result.frontmatter.title).toBe('How It Works')
  })

  test('contains a Tabs block-component', async () => {
    const result = await renderMdx(HOW_IT_WORKS_MDX)
    const block = result.parts.find((p) => p.type === 'block-component')!
    expect(block).toBeDefined()
    if (block.type === 'block-component') {
      expect(block.name).toBe('Tabs')
      expect(block.children).toHaveLength(2)
    }
  })
})

describe('projectMdxToMarkdown (how-it-works)', () => {
  test('projects cleanly with default tab', () => {
    const projected = projectMdxToMarkdown(HOW_IT_WORKS_MDX, defaultMdxProjectors)
    expect(projected).toContain('## Two-Phase Compilation')
    expect(projected).not.toContain('<Tabs')
    expect(projected).not.toContain('<Tab ')
  })
})

describe('renderMdx (README)', () => {
  test('renders self-closing Tabs as component nodes', async () => {
    const result = await renderMdx(README_MDX)
    const components = result.parts.filter((p) => p.type === 'component')
    expect(components.length).toBeGreaterThanOrEqual(2)
    if (components[0].type === 'component') {
      expect(components[0].name).toBe('Tabs')
    }
  })
})

describe('projectMdxToMarkdown (README)', () => {
  test('projects self-closing Tabs to bulleted lists', () => {
    const projected = projectMdxToMarkdown(README_MDX, defaultMdxProjectors)
    expect(projected).toContain('- Hono (default)')
    expect(projected).toContain('- Go Template')
    expect(projected).toContain('- npm (default)')
    expect(projected).not.toContain('<Tabs')
  })
})
