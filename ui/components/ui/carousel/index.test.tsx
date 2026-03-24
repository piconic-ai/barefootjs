import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const source = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('Carousel', () => {
  const result = renderToTest(source, 'carousel.tsx', 'Carousel')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is Carousel', () => {
    expect(result.componentName).toBe('Carousel')
  })

  test('has signals: canScrollPrev, canScrollNext', () => {
    expect(result.signals).toContain('canScrollPrev')
    expect(result.signals).toContain('canScrollNext')
  })

  test('renders with role=region', () => {
    const region = result.find({ role: 'region' })
    expect(region).not.toBeNull()
    expect(region!.props['data-slot']).toBe('carousel')
  })

  test('has aria-roledescription=carousel', () => {
    const region = result.find({ role: 'region' })!
    expect(region.aria).toHaveProperty('roledescription')
  })
})

describe('CarouselContent', () => {
  const result = renderToTest(source, 'carousel.tsx', 'CarouselContent')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders div with data-slot=carousel-viewport', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('carousel-viewport')
  })
})

describe('CarouselItem', () => {
  const result = renderToTest(source, 'carousel.tsx', 'CarouselItem')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('has role=group', () => {
    const item = result.find({ role: 'group' })
    expect(item).not.toBeNull()
    expect(item!.props['data-slot']).toBe('carousel-item')
  })

  test('has aria-roledescription=slide', () => {
    const item = result.find({ role: 'group' })!
    expect(item.aria).toHaveProperty('roledescription')
  })
})

describe('CarouselPrevious', () => {
  const result = renderToTest(source, 'carousel.tsx', 'CarouselPrevious')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as button with data-slot', () => {
    const button = result.find({ tag: 'button' })
    expect(button).not.toBeNull()
    expect(button!.props['data-slot']).toBe('carousel-previous')
  })

  test('has aria-label', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.aria).toHaveProperty('label')
  })

})

describe('CarouselNext', () => {
  const result = renderToTest(source, 'carousel.tsx', 'CarouselNext')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as button with data-slot', () => {
    const button = result.find({ tag: 'button' })
    expect(button).not.toBeNull()
    expect(button!.props['data-slot']).toBe('carousel-next')
  })

  test('has aria-label', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.aria).toHaveProperty('label')
  })

})
