import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import path from 'path'
import { parseComponent } from '../src/lib/parse-component'

const COMPONENTS_DIR = path.resolve(import.meta.dir, '../../../ui/components/ui')

function readComponent(name: string): string {
  return readFileSync(path.join(COMPONENTS_DIR, name, 'index.tsx'), 'utf-8')
}

describe('parseComponent', () => {
  describe('button.tsx — stateless, variants, extends ButtonHTMLAttributes', () => {
    const source = readComponent('button')
    const result = parseComponent(source)

    test('detects "use client"', () => {
      expect(result.useClient).toBe(true)
    })

    test('extracts top-level description', () => {
      expect(result.description).toContain('Button Component')
      expect(result.description).toContain('UnoCSS utility classes')
    })

    test('extracts examples', () => {
      expect(result.examples.length).toBeGreaterThanOrEqual(2)
      expect(result.examples[0].title).toBe('Basic usage')
      expect(result.examples[0].code).toContain('<Button>')
    })

    test('extracts props', () => {
      const propNames = result.props.map(p => p.name)
      expect(propNames).toContain('variant')
      expect(propNames).toContain('size')
      expect(propNames).toContain('asChild')
      expect(propNames).toContain('children')
    })

    test('extracts prop defaults', () => {
      const variant = result.props.find(p => p.name === 'variant')
      expect(variant?.default).toBe('default')
      const size = result.props.find(p => p.name === 'size')
      expect(size?.default).toBe('default')
    })

    test('extracts variants', () => {
      expect(result.variants).toHaveProperty('ButtonVariant')
      expect(result.variants.ButtonVariant).toContain('default')
      expect(result.variants.ButtonVariant).toContain('destructive')
      expect(result.variants).toHaveProperty('ButtonSize')
      expect(result.variants.ButtonSize).toContain('sm')
      expect(result.variants.ButtonSize).toContain('icon')
    })

    test('has no sub-components', () => {
      expect(result.subComponents).toHaveLength(0)
    })

    test('detects internal dependencies', () => {
      expect(result.dependencies.internal).toContain('slot')
    })
  })

  describe('checkbox.tsx — stateful, controlled/uncontrolled, ARIA', () => {
    const source = readComponent('checkbox')
    const result = parseComponent(source)

    test('detects "use client"', () => {
      expect(result.useClient).toBe(true)
    })

    test('extracts description', () => {
      expect(result.description).toContain('Checkbox Component')
    })

    test('extracts props with descriptions', () => {
      const defaultChecked = result.props.find(p => p.name === 'defaultChecked')
      expect(defaultChecked).toBeDefined()
      expect(defaultChecked!.type).toBe('boolean')
      expect(defaultChecked!.description).toContain('uncontrolled')

      const checked = result.props.find(p => p.name === 'checked')
      expect(checked).toBeDefined()
      expect(checked!.description).toContain('controlled')
    })

    test('extracts ARIA attributes', () => {
      expect(result.accessibility.role).toContain('checkbox')
      expect(result.accessibility.ariaAttributes).toContain('aria-checked')
      expect(result.accessibility.dataAttributes).toContain('data-state')
      expect(result.accessibility.dataAttributes).toContain('data-slot')
    })

    test('extracts examples', () => {
      expect(result.examples.length).toBeGreaterThanOrEqual(3)
      const titles = result.examples.map(e => e.title)
      expect(titles).toContain('Uncontrolled (internal state)')
      expect(titles).toContain('Controlled (external state)')
    })
  })

  describe('dialog.tsx — multi-component, context, portal', () => {
    const source = readComponent('dialog')
    const result = parseComponent(source)

    test('detects "use client"', () => {
      expect(result.useClient).toBe(true)
    })

    test('extracts multiple exported names', () => {
      expect(result.exportedNames).toContain('Dialog')
      expect(result.exportedNames).toContain('DialogTrigger')
      expect(result.exportedNames).toContain('DialogContent')
      expect(result.exportedNames).toContain('DialogClose')
      expect(result.exportedNames.length).toBeGreaterThanOrEqual(8)
    })

    test('extracts sub-components', () => {
      const subNames = result.subComponents.map(s => s.name)
      expect(subNames).toContain('DialogTrigger')
      expect(subNames).toContain('DialogContent')
      expect(subNames).toContain('DialogClose')
    })

    test('detects portal and context dependencies', () => {
      expect(result.dependencies.external).toContain('@barefootjs/client')
    })

    test('extracts accessibility info', () => {
      expect(result.accessibility.role).toContain('dialog')
      expect(result.accessibility.ariaAttributes).toContain('aria-modal')
    })
  })

  describe('label.tsx — simple, with JSDoc', () => {
    const source = readComponent('label')
    const result = parseComponent(source)

    test('does not have "use client"', () => {
      expect(result.useClient).toBe(false)
    })

    test('extracts description', () => {
      expect(result.description).toContain('Label Component')
      expect(result.description).toContain('form')
    })

    test('extracts examples', () => {
      expect(result.examples.length).toBeGreaterThanOrEqual(1)
      expect(result.examples[0].code).toContain('<Label>')
    })

    test('extracts props', () => {
      const propNames = result.props.map(p => p.name)
      expect(propNames).toContain('className')
      expect(propNames).toContain('children')
    })
  })

  describe('separator.tsx — no "use client", orientation variants', () => {
    const source = readComponent('separator')
    const result = parseComponent(source)

    test('does not have "use client"', () => {
      expect(result.useClient).toBe(false)
    })

    test('extracts description', () => {
      expect(result.description).toContain('Separator Component')
    })

    test('extracts props', () => {
      const orientation = result.props.find(p => p.name === 'orientation')
      expect(orientation).toBeDefined()
      expect(orientation!.type).toBe('SeparatorOrientation')

      const decorative = result.props.find(p => p.name === 'decorative')
      expect(decorative).toBeDefined()
      expect(decorative!.type).toBe('boolean')
    })

    test('extracts orientation variant', () => {
      expect(result.variants).toHaveProperty('SeparatorOrientation')
      expect(result.variants.SeparatorOrientation).toEqual(['horizontal', 'vertical'])
    })

    test('extracts ARIA attributes', () => {
      // role is conditional: decorative ? 'none' : 'separator'
      // Parser captures both via regex: "decorative, none, separator"
      expect(result.accessibility.ariaAttributes).toContain('aria-orientation')
    })
  })
})
