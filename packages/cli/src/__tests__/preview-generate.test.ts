import { describe, test, expect } from 'bun:test'
import { readdirSync } from 'fs'
import path from 'path'
import { loadComponent } from '../lib/meta-loader'
import { generatePreview } from '../lib/preview-generate'
import type { ComponentMeta } from '../lib/types'

function makeMeta(overrides: Partial<ComponentMeta>): ComponentMeta {
  return {
    name: 'test',
    title: 'Test',
    category: 'data-display',
    description: '',
    props: [],
    examples: [],
    tags: [],
    stateful: false,
    accessibility: { keyboard: [], aria: [] },
    dependencies: { internal: [], external: [] },
    related: [],
    source: 'ui/components/ui/test/index.tsx',
    ...overrides,
  }
}

describe('generatePreview', () => {
  describe('Fragment wrapping', () => {
    test('multi-root JSX is wrapped in Fragment', () => {
      const meta = makeMeta({
        name: 'typography',
        subComponents: [{ name: 'TypographyH2', description: '', props: [] }],
        examples: [{ title: 'Headings', code: '<TypographyH1>H1</TypographyH1>\n<TypographyH2>H2</TypographyH2>' }],
      })
      const result = generatePreview(meta)
      expect(result.code).toContain('<>')
      expect(result.code).toContain('</>')
    })

    test('single-root multi-line JSX is NOT wrapped in Fragment', () => {
      const meta = makeMeta({
        name: 'input-group',
        subComponents: [
          { name: 'InputGroupAddon', description: '', props: [] },
          { name: 'InputGroupInput', description: '', props: [] },
        ],
        examples: [{ title: 'Basic', code: '<InputGroup>\n  <InputGroupAddon>prefix</InputGroupAddon>\n  <InputGroupInput />\n</InputGroup>' }],
      })
      const result = generatePreview(meta)
      expect(result.code).not.toContain('<>')
    })

    test('single-line multi-root JSX is wrapped in Fragment', () => {
      const meta = makeMeta({
        name: 'inline',
        subComponents: [
          { name: 'InlineA', description: '', props: [] },
          { name: 'InlineB', description: '', props: [] },
        ],
        examples: [{ title: 'Inline', code: '<InlineA /><InlineB />' }],
      })
      const result = generatePreview(meta)
      expect(result.code).toContain('<>')
    })

    test('closing tags do not count as extra roots', () => {
      const meta = makeMeta({
        name: 'wrapper',
        subComponents: [{ name: 'WrapperChild', description: '', props: [] }],
        examples: [{ title: 'Single', code: '<Wrapper>content</Wrapper>' }],
      })
      const result = generatePreview(meta)
      expect(result.code).not.toContain('<>')
    })
  })

  describe('import resolution', () => {
    test('XxxIcon tags import from ../icon', () => {
      const meta = makeMeta({
        name: 'input-group',
        subComponents: [{ name: 'InputGroupInput', description: '', props: [] }],
        examples: [{ title: 'With icon', code: '<InputGroup>\n  <SearchIcon />\n  <InputGroupInput />\n</InputGroup>' }],
      })
      const result = generatePreview(meta)
      expect(result.code).toContain("from '../icon'")
      expect(result.code).not.toContain("from '../search-icon'")
    })

    test('tags sharing parent prefix import from parent module', () => {
      const meta = makeMeta({
        name: 'typography',
        subComponents: [{ name: 'TypographyH2', description: '', props: [] }],
        examples: [{ title: 'Headings', code: '<TypographyH1>H1</TypographyH1>\n<TypographyH2>H2</TypographyH2>' }],
      })
      const result = generatePreview(meta)
      expect(result.code).toContain("TypographyH1 } from '../typography'")
      expect(result.code).not.toContain("from '../typography-h1'")
    })

    test('unused root component is not imported for multi-component with examples', () => {
      const meta = makeMeta({
        name: 'typography',
        subComponents: [{ name: 'TypographyH2', description: '', props: [] }],
        examples: [{ title: 'Headings', code: '<TypographyH1>H1</TypographyH1>\n<TypographyH2>H2</TypographyH2>' }],
      })
      const result = generatePreview(meta)
      expect(result.code).not.toMatch(/\bTypography,/)
      expect(result.code).not.toMatch(/\{ Typography }/)
    })
  })

  describe('general behavior', () => {
    test('filePath includes component name', () => {
      const meta = makeMeta({ name: 'button' })
      const result = generatePreview(meta)
      expect(result.filePath).toBe('ui/components/ui/button/index.preview.tsx')
    })

    test('filePath respects custom componentsBasePath', () => {
      const meta = makeMeta({ name: 'button' })
      const result = generatePreview(meta, 'components/ui')
      expect(result.filePath).toBe('components/ui/button/index.preview.tsx')
    })

    test('stateful component includes "use client"', () => {
      const meta = makeMeta({ name: 'switch', stateful: true })
      const result = generatePreview(meta)
      expect(result.code).toContain('"use client"')
    })

    test('stateless component omits "use client"', () => {
      const meta = makeMeta({ name: 'badge' })
      const result = generatePreview(meta)
      expect(result.code).not.toContain('"use client"')
    })

    test('previewNames contains Default', () => {
      const meta = makeMeta({ name: 'badge' })
      const result = generatePreview(meta)
      expect(result.previewNames).toContain('Default')
    })

    test('variants generate additional preview functions', () => {
      const meta = makeMeta({
        name: 'badge',
        props: [{ name: 'variant', type: 'BadgeVariant', required: false, description: '' }],
        variants: { BadgeVariant: ['default', 'secondary'] },
      })
      const result = generatePreview(meta)
      expect(result.previewNames).toContain('Variants')
      expect(result.code).toContain('variant="default"')
      expect(result.code).toContain('variant="secondary"')
    })
  })

  describe('smoke test: all real components', () => {
    const metaDir = path.resolve(import.meta.dir, '../../../../ui/meta')
    const allComponents = readdirSync(metaDir)
      .filter(f => f.endsWith('.json') && f !== 'index.json')
      .map(f => f.replace('.json', ''))

    for (const name of allComponents) {
      test(`${name}: no crash, valid output`, () => {
        const meta = loadComponent(metaDir, name)
        const result = generatePreview(meta)
        expect(result.code).toBeTruthy()
        expect(result.previewNames.length).toBeGreaterThanOrEqual(1)
        expect(result.filePath).toBe(`ui/components/ui/${name}/index.preview.tsx`)
      })
    }
  })
})
