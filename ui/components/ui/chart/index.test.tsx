import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const source = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('ChartContainer', () => {
  const result = renderToTest(source, 'chart.tsx', 'ChartContainer')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is ChartContainer', () => {
    expect(result.componentName).toBe('ChartContainer')
  })

  test('renders div with data-slot=chart-container', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('chart-container')
  })
})

describe('BarChart', () => {
  const result = renderToTest(source, 'chart.tsx', 'BarChart')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders with data-slot=bar-chart', () => {
    expect(result.root.props['data-slot']).toBe('bar-chart')
  })
})

describe('LineChart', () => {
  const result = renderToTest(source, 'chart.tsx', 'LineChart')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders with data-slot=line-chart', () => {
    expect(result.root.props['data-slot']).toBe('line-chart')
  })
})

describe('PieChart', () => {
  const result = renderToTest(source, 'chart.tsx', 'PieChart')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders with data-slot=pie-chart', () => {
    expect(result.root.props['data-slot']).toBe('pie-chart')
  })
})

describe('AreaChart', () => {
  const result = renderToTest(source, 'chart.tsx', 'AreaChart')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders with data-slot=area-chart', () => {
    expect(result.root.props['data-slot']).toBe('area-chart')
  })
})

describe('RadialChart', () => {
  const result = renderToTest(source, 'chart.tsx', 'RadialChart')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders with data-slot=radial-chart', () => {
    expect(result.root.props['data-slot']).toBe('radial-chart')
  })
})

describe('RadarChart', () => {
  const result = renderToTest(source, 'chart.tsx', 'RadarChart')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders with data-slot=radar-chart', () => {
    expect(result.root.props['data-slot']).toBe('radar-chart')
  })
})
