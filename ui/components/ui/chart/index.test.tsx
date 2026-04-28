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

// JSX-native containers all share the same shape: <div data-slot="X"><svg><g>{children}</g></svg></div>.
// Walk that shape via TestNode.find so a regression to the imperative wrapper
// (which would have no nested <svg>) is caught at the IR layer rather than e2e.
function expectSvgContainerShape(result: ReturnType<typeof renderToTest>, slot: string): void {
  expect(result.root.tag).toBe('div')
  expect(result.root.props['data-slot']).toBe(slot)

  const svg = result.root.find({ tag: 'svg' })
  expect(svg).not.toBeNull()
  // viewBox is reactive (driven by a signal), so the IR records the prop key
  // even when the value is dynamic — assert presence, not exact value.
  expect('viewBox' in svg!.props).toBe(true)

  const g = svg!.find({ tag: 'g' })
  expect(g).not.toBeNull()
  expect('transform' in g!.props).toBe(true)
}

describe('BarChart', () => {
  const result = renderToTest(source, 'chart.tsx', 'BarChart')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('renders <div data-slot="bar-chart"><svg><g>{children}</g></svg></div>', () => {
    expectSvgContainerShape(result, 'bar-chart')
  })

  test('declares the bar registration signals', () => {
    // Failure here means the chart context plumbing was lost during refactor.
    expect(result.signals).toContain('bars')
    expect(result.signals).toContain('xDataKey')
    expect(result.signals).toContain('width')
  })
})

describe('LineChart', () => {
  const result = renderToTest(source, 'chart.tsx', 'LineChart')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders SVG container shape', () => {
    expectSvgContainerShape(result, 'line-chart')
  })
})

describe('PieChart', () => {
  const result = renderToTest(source, 'chart.tsx', 'PieChart')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders SVG container shape', () => {
    expectSvgContainerShape(result, 'pie-chart')
  })
})

describe('AreaChart', () => {
  const result = renderToTest(source, 'chart.tsx', 'AreaChart')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders SVG container shape', () => {
    expectSvgContainerShape(result, 'area-chart')
  })
})

describe('RadialChart', () => {
  const result = renderToTest(source, 'chart.tsx', 'RadialChart')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders SVG container shape', () => {
    expectSvgContainerShape(result, 'radial-chart')
  })
})

describe('RadarChart', () => {
  const result = renderToTest(source, 'chart.tsx', 'RadarChart')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders SVG container shape', () => {
    expectSvgContainerShape(result, 'radar-chart')
  })
})

// JSX-native primitives migrated in Phase 9 step 2 (#1080) — each one returns
// a single `<g>` decorated with the chart class constant so the e2e selectors
// (`.chart-grid`, `.chart-x-axis`, ...) keep working without the cssLayerPrefixer.
describe('CartesianGrid', () => {
  const result = renderToTest(source, 'chart.tsx', 'CartesianGrid')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('renders <g> root with the chart-grid class', () => {
    expect(result.root.tag).toBe('g')
    expect(String(result.root.props['className'] ?? result.root.classes.join(' '))).toContain('CHART_CLASS_GRID')
  })
})

describe('XAxis', () => {
  const result = renderToTest(source, 'chart.tsx', 'XAxis')
  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })
  test('renders <g> root', () => {
    expect(result.root.tag).toBe('g')
  })
})

describe('YAxis', () => {
  const result = renderToTest(source, 'chart.tsx', 'YAxis')
  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })
  test('renders <g> root', () => {
    expect(result.root.tag).toBe('g')
  })
})

describe('PolarGrid', () => {
  const result = renderToTest(source, 'chart.tsx', 'PolarGrid')
  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })
  test('renders <g> root', () => {
    expect(result.root.tag).toBe('g')
  })
})

describe('PolarAngleAxis', () => {
  const result = renderToTest(source, 'chart.tsx', 'PolarAngleAxis')
  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })
  test('renders <g> root', () => {
    expect(result.root.tag).toBe('g')
  })
})

describe('RadialBar', () => {
  const result = renderToTest(source, 'chart.tsx', 'RadialBar')
  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })
  test('renders <g> root', () => {
    expect(result.root.tag).toBe('g')
  })
})

// JSX-native primitives migrated in Phase 9 step 3 (#1080).
describe('RadialChartLabel', () => {
  const result = renderToTest(source, 'chart.tsx', 'RadialChartLabel')
  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })
  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })
  test('renders <foreignObject> root with the chart-radial-label class', () => {
    expect(result.root.tag).toBe('foreignObject')
    expect(String(result.root.props['className'] ?? result.root.classes.join(' '))).toContain('CHART_CLASS_RADIAL_LABEL')
  })
})

describe('Bar', () => {
  const result = renderToTest(source, 'chart.tsx', 'Bar')
  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })
  test('renders <g> root', () => {
    expect(result.root.tag).toBe('g')
  })
})

describe('Line', () => {
  const result = renderToTest(source, 'chart.tsx', 'Line')
  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })
  test('renders <g> root', () => {
    expect(result.root.tag).toBe('g')
  })
})

describe('Area', () => {
  const result = renderToTest(source, 'chart.tsx', 'Area')
  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })
  test('renders <g> root', () => {
    expect(result.root.tag).toBe('g')
  })
})

describe('Radar', () => {
  const result = renderToTest(source, 'chart.tsx', 'Radar')
  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })
  test('renders <g> root', () => {
    expect(result.root.tag).toBe('g')
  })
})

// JSX-native primitive migrated in Phase 9 step 4 (#1080).
describe('Pie', () => {
  const result = renderToTest(source, 'chart.tsx', 'Pie')
  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })
  test('renders <g> root', () => {
    expect(result.root.tag).toBe('g')
  })
})
