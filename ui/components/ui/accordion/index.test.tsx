import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const accordionSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

// ---------------------------------------------------------------------------
// Accordion (stateless container — destructured props, no signals)
// ---------------------------------------------------------------------------

describe('Accordion', () => {
  const result = renderToTest(accordionSource, 'accordion.tsx', 'Accordion')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is Accordion', () => {
    expect(result.componentName).toBe('Accordion')
  })

  test('no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('renders as div with data-slot=accordion', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('accordion')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('w-full')
  })
})

// ---------------------------------------------------------------------------
// AccordionItem (stateful — uses props pattern, Provider wrapping)
// ---------------------------------------------------------------------------

describe('AccordionItem', () => {
  const result = renderToTest(accordionSource, 'accordion.tsx', 'AccordionItem')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is AccordionItem', () => {
    expect(result.componentName).toBe('AccordionItem')
  })

  test('no signals', () => {
    expect(result.signals).toEqual([])
  })

  test('renders as div with data-slot=accordion-item', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('accordion-item')
  })

  test('has data-state attribute', () => {
    expect(result.root.dataState).not.toBeNull()
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('border-b')

  })
})

// ---------------------------------------------------------------------------
// AccordionTrigger (stateful — context effect, click event, aria)
// ---------------------------------------------------------------------------

describe('AccordionTrigger', () => {
  const result = renderToTest(accordionSource, 'accordion.tsx', 'AccordionTrigger')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is AccordionTrigger', () => {
    expect(result.componentName).toBe('AccordionTrigger')
  })

  test('root is conditional (asChild branch)', () => {
    expect(result.root.type).toBe('conditional')
  })

  test('contains a <button> element', () => {
    const button = result.find({ tag: 'button' })
    expect(button).not.toBeNull()
  })

  test('button has aria-expanded attribute', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.aria).toHaveProperty('expanded')
  })

  test('button has data-slot=accordion-trigger', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.props['data-slot']).toBe('accordion-trigger')
  })

  test('button has resolved CSS classes', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.classes).toContain('flex')
    expect(button.classes).toContain('flex-1')
    expect(button.classes).toContain('items-start')
  })

  test('contains ChevronDownIcon component', () => {
    const icon = result.find({ componentName: 'ChevronDownIcon' })
    expect(icon).not.toBeNull()
  })

  test('asChild branch uses span with display:contents', () => {
    const span = result.find({ tag: 'span' })
    expect(span).not.toBeNull()
    expect(span!.props['style']).toBe('display:contents')
    expect(span!.aria).toHaveProperty('expanded')
  })

  test('toStructure() shows conditional and button', () => {
    const structure = result.toStructure()
    expect(structure).toContain('button')
    expect(structure).toContain('[aria-expanded]')
  })

  test('aria-expanded is a compiler-analyzable expression bound to the open prop, not a hard-coded literal (#3065)', () => {
    // Previously this was the literal `"false"`, corrected only by the
    // ref-mount effect — never at SSR. It now depends on `props.open`
    // (passed by the caller alongside the sibling AccordionItem's `open`),
    // so `aria-expanded` renders correctly for both branches at SSR.
    const button = result.find({ tag: 'button' })!
    expect(button.aria.expanded).toBe('{props.open}')

    const span = result.find({ tag: 'span' })!
    expect(span.aria.expanded).toBe('{props.open}')
  })
})

// ---------------------------------------------------------------------------
// AccordionContent (stateful — context effect, role=region, data-state)
// ---------------------------------------------------------------------------

describe('AccordionContent', () => {
  const result = renderToTest(accordionSource, 'accordion.tsx', 'AccordionContent')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is AccordionContent', () => {
    expect(result.componentName).toBe('AccordionContent')
  })

  test('renders as div with role=region', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.role).toBe('region')
  })

  test('has data-slot=accordion-content', () => {
    expect(result.root.props['data-slot']).toBe('accordion-content')
  })

  test('data-state is a compiler-analyzable expression bound to the open prop, not a hard-coded "closed" literal (#3065)', () => {
    // Previously this was the literal "closed", corrected only by the
    // ref-mount effect — never at SSR. It now depends on `props.open`
    // (passed by the caller alongside the sibling AccordionItem's
    // `open`), so `data-state` renders correctly for both branches at
    // SSR.
    expect(result.root.dataState).toBe('{props.open}')
  })

  test('has resolved CSS classes including animation classes', () => {
    expect(result.root.classes).toContain('grid')
    expect(result.root.classes).toContain('transition-[grid-template-rows,visibility]')
  })

  test('inner div has resolved content classes', () => {
    const innerDivs = result.findAll({ tag: 'div' })
    // First child div should have overflow-hidden
    const contentWrapper = innerDivs.find(d => d.classes.includes('overflow-hidden'))
    expect(contentWrapper).not.toBeNull()
    expect(contentWrapper!.classes).toContain('text-sm')
  })

  test('toStructure() shows region role and data-state', () => {
    const structure = result.toStructure()
    expect(structure).toContain('[role=region]')
    expect(structure).toContain('[data-state]')
  })
})
