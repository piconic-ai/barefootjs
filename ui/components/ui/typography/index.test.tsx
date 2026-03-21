import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const typographySource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('TypographyH1', () => {
  const result = renderToTest(typographySource, 'typography.tsx', 'TypographyH1')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is TypographyH1', () => {
    expect(result.componentName).toBe('TypographyH1')
  })

  test('no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('renders as h1 with data-slot=typography-h1', () => {
    expect(result.root.tag).toBe('h1')
    expect(result.root.props['data-slot']).toBe('typography-h1')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('scroll-m-20')
    expect(result.root.classes).toContain('text-4xl')
    expect(result.root.classes).toContain('font-extrabold')
  })
})

describe('TypographyH2', () => {
  const result = renderToTest(typographySource, 'typography.tsx', 'TypographyH2')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as h2 with data-slot=typography-h2', () => {
    expect(result.root.tag).toBe('h2')
    expect(result.root.props['data-slot']).toBe('typography-h2')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('text-3xl')
    expect(result.root.classes).toContain('font-semibold')
    expect(result.root.classes).toContain('border-b')
  })
})

describe('TypographyH3', () => {
  const result = renderToTest(typographySource, 'typography.tsx', 'TypographyH3')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as h3 with data-slot=typography-h3', () => {
    expect(result.root.tag).toBe('h3')
    expect(result.root.props['data-slot']).toBe('typography-h3')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('text-2xl')
    expect(result.root.classes).toContain('font-semibold')
  })
})

describe('TypographyH4', () => {
  const result = renderToTest(typographySource, 'typography.tsx', 'TypographyH4')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as h4 with data-slot=typography-h4', () => {
    expect(result.root.tag).toBe('h4')
    expect(result.root.props['data-slot']).toBe('typography-h4')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('text-xl')
    expect(result.root.classes).toContain('font-semibold')
  })
})

describe('TypographyP', () => {
  const result = renderToTest(typographySource, 'typography.tsx', 'TypographyP')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as p with data-slot=typography-p', () => {
    expect(result.root.tag).toBe('p')
    expect(result.root.props['data-slot']).toBe('typography-p')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('leading-7')
  })
})

describe('TypographyBlockquote', () => {
  const result = renderToTest(typographySource, 'typography.tsx', 'TypographyBlockquote')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as blockquote with data-slot=typography-blockquote', () => {
    expect(result.root.tag).toBe('blockquote')
    expect(result.root.props['data-slot']).toBe('typography-blockquote')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('border-l-2')
    expect(result.root.classes).toContain('italic')
  })
})

describe('TypographyList', () => {
  const result = renderToTest(typographySource, 'typography.tsx', 'TypographyList')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as ul with data-slot=typography-list', () => {
    expect(result.root.tag).toBe('ul')
    expect(result.root.props['data-slot']).toBe('typography-list')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('list-disc')
  })
})

describe('TypographyInlineCode', () => {
  const result = renderToTest(typographySource, 'typography.tsx', 'TypographyInlineCode')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as code with data-slot=typography-inline-code', () => {
    expect(result.root.tag).toBe('code')
    expect(result.root.props['data-slot']).toBe('typography-inline-code')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('font-mono')
    expect(result.root.classes).toContain('rounded')
  })
})

describe('TypographyLead', () => {
  const result = renderToTest(typographySource, 'typography.tsx', 'TypographyLead')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as p with data-slot=typography-lead', () => {
    expect(result.root.tag).toBe('p')
    expect(result.root.props['data-slot']).toBe('typography-lead')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('text-xl')
  })
})

describe('TypographyLarge', () => {
  const result = renderToTest(typographySource, 'typography.tsx', 'TypographyLarge')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as div with data-slot=typography-large', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('typography-large')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('text-lg')
    expect(result.root.classes).toContain('font-semibold')
  })
})

describe('TypographySmall', () => {
  const result = renderToTest(typographySource, 'typography.tsx', 'TypographySmall')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as small with data-slot=typography-small', () => {
    expect(result.root.tag).toBe('small')
    expect(result.root.props['data-slot']).toBe('typography-small')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('text-sm')
    expect(result.root.classes).toContain('font-medium')
  })
})

describe('TypographyMuted', () => {
  const result = renderToTest(typographySource, 'typography.tsx', 'TypographyMuted')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as p with data-slot=typography-muted', () => {
    expect(result.root.tag).toBe('p')
    expect(result.root.props['data-slot']).toBe('typography-muted')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('text-sm')
  })
})
