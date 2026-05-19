import { describe, test, expect } from 'bun:test'
import { readdirSync } from 'fs'
import path from 'path'
import { loadComponent } from '../lib/meta-loader'
import { generatePreview, type PreviewGenerateResult } from '../lib/preview-generate'

const metaDir = path.resolve(import.meta.dir, '../../../../ui/meta')

// Load all component names (exclude index.json)
const allComponents = readdirSync(metaDir)
  .filter(f => f.endsWith('.json') && f !== 'index.json')
  .map(f => f.replace('.json', ''))

describe('generatePreview', () => {
  describe('all components produce valid output', () => {
    for (const name of allComponents) {
      test(`${name}: no crash, ≥1 preview`, () => {
        const meta = loadComponent(metaDir, name)
        const result = generatePreview(meta)

        expect(result.code).toBeTruthy()
        expect(result.previewNames.length).toBeGreaterThanOrEqual(1)
        expect(result.filePath).toBe(`ui/components/ui/${name}/index.preview.tsx`)
      })
    }
  })

  describe('componentsBasePath', () => {
    test('default keeps the monorepo registry layout (backwards compat)', () => {
      const meta = loadComponent(metaDir, 'button')
      const result = generatePreview(meta)
      expect(result.filePath).toBe('ui/components/ui/button/index.preview.tsx')
    })

    test('scaffolded apps land previews under paths.components, not ui/components/ui', () => {
      // Mirrors what `resolveScaffoldLayout` returns for a project with
      // the default scaffold config (`paths.components = 'components/ui'`).
      const meta = loadComponent(metaDir, 'button')
      const result = generatePreview(meta, 'components/ui')
      expect(result.filePath).toBe('components/ui/button/index.preview.tsx')
    })
  })

  describe('determinism', () => {
    test('same meta produces identical output', () => {
      const meta = loadComponent(metaDir, 'button')
      const a = generatePreview(meta)
      const b = generatePreview(meta)
      expect(a.code).toBe(b.code)
      expect(a.previewNames).toEqual(b.previewNames)
    })
  })

  describe('"use client" correctness', () => {
    test('stateful component has "use client"', () => {
      const meta = loadComponent(metaDir, 'checkbox')
      const result = generatePreview(meta)
      expect(result.code).toContain('"use client"')
    })

    test('stateless component does not have "use client"', () => {
      const meta = loadComponent(metaDir, 'button')
      const result = generatePreview(meta)
      expect(result.code).not.toContain('"use client"')
    })

    test('multi-component with stateful tag has "use client"', () => {
      const meta = loadComponent(metaDir, 'accordion')
      const result = generatePreview(meta)
      expect(result.code).toContain('"use client"')
    })

    test('multi-component without stateful tag has no "use client"', () => {
      const meta = loadComponent(metaDir, 'card')
      const result = generatePreview(meta)
      expect(result.code).not.toContain('"use client"')
    })
  })

  describe('stateless + variants (button)', () => {
    let result: PreviewGenerateResult

    test('setup', () => {
      const meta = loadComponent(metaDir, 'button')
      result = generatePreview(meta)
    })

    test('has Default preview', () => {
      expect(result.previewNames).toContain('Default')
      expect(result.code).toContain('export function Default()')
    })

    test('has Variants preview with all 6 variants', () => {
      expect(result.previewNames).toContain('Variants')
      expect(result.code).toContain('variant="default"')
      expect(result.code).toContain('variant="destructive"')
      expect(result.code).toContain('variant="outline"')
      expect(result.code).toContain('variant="secondary"')
      expect(result.code).toContain('variant="ghost"')
      expect(result.code).toContain('variant="link"')
    })

    test('has Sizes preview', () => {
      expect(result.previewNames).toContain('Sizes')
      expect(result.code).toContain('size="default"')
      expect(result.code).toContain('size="sm"')
      expect(result.code).toContain('size="lg"')
    })

    test('imports from correct path', () => {
      expect(result.code).toContain("from '../button'")
    })
  })

  describe('stateless simple (input)', () => {
    test('renders with first simple example', () => {
      const meta = loadComponent(metaDir, 'input')
      const result = generatePreview(meta)
      expect(result.previewNames).toContain('Default')
      expect(result.code).toContain('<Input')
    })
  })

  describe('stateful simple (checkbox)', () => {
    let result: PreviewGenerateResult

    test('setup', () => {
      const meta = loadComponent(metaDir, 'checkbox')
      result = generatePreview(meta)
    })

    test('has Default preview with state variations', () => {
      expect(result.previewNames).toContain('Default')
      expect(result.code).toContain('<Checkbox />')
      expect(result.code).toContain('<Checkbox defaultChecked />')
    })

    test('does not import createSignal (not used in generated code)', () => {
      expect(result.code).not.toContain("import { createSignal }")
    })
  })

  describe('stateful + variants (toggle)', () => {
    let result: PreviewGenerateResult

    test('setup', () => {
      const meta = loadComponent(metaDir, 'toggle')
      result = generatePreview(meta)
    })

    test('has Default and variant previews', () => {
      expect(result.previewNames).toContain('Default')
      expect(result.previewNames).toContain('Variants')
    })

    test('has "use client"', () => {
      expect(result.code).toContain('"use client"')
    })
  })

  describe('multi-component (accordion)', () => {
    let result: PreviewGenerateResult

    test('setup', () => {
      const meta = loadComponent(metaDir, 'accordion')
      result = generatePreview(meta)
    })

    test('uses example code', () => {
      expect(result.code).toContain('AccordionTrigger')
      expect(result.code).toContain('AccordionContent')
    })

    test('imports createSignal when example uses it', () => {
      expect(result.code).toContain("import { createSignal }")
    })

    test('imports sub-components', () => {
      expect(result.code).toContain('AccordionItem')
    })
  })

  describe('multi-component (card) — stateless', () => {
    let result: PreviewGenerateResult

    test('setup', () => {
      const meta = loadComponent(metaDir, 'card')
      result = generatePreview(meta)
    })

    test('uses example code', () => {
      expect(result.code).toContain('CardHeader')
      expect(result.code).toContain('CardTitle')
      expect(result.code).toContain('CardContent')
    })

    test('does not have "use client"', () => {
      expect(result.code).not.toContain('"use client"')
    })
  })

  describe('multi-component with external refs (dialog)', () => {
    let result: PreviewGenerateResult

    test('setup', () => {
      const meta = loadComponent(metaDir, 'dialog')
      result = generatePreview(meta)
    })

    test('imports external component tags', () => {
      expect(result.code).toContain("from '../button'")
    })

    test('injects no-op for undefined handlers', () => {
      expect(result.code).toContain('const handleAction = () => {}')
    })
  })

  describe('header comment', () => {
    test('all generated previews start with auto-generated comment', () => {
      const meta = loadComponent(metaDir, 'button')
      const result = generatePreview(meta)
      expect(result.code.startsWith('// Auto-generated preview.')).toBe(true)
    })
  })
})
