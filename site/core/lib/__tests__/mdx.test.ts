import { describe, test, expect, beforeAll } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderMdx, projectMdxToMarkdown, defaultMdxProjectors } from '../mdx'
import { initHighlighter } from '../markdown'

const QUICK_START_MDX = readFileSync(
  resolve(import.meta.dir, '../../../../docs/core/quick-start.mdx'),
  'utf-8',
)

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
