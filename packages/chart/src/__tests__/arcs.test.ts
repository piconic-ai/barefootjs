import { describe, expect, test } from 'bun:test'
import { buildPieSlices } from '../utils/arcs.ts'

const data = [
  { browser: 'chrome', visitors: 3 },
  { browser: 'safari', visitors: 1 },
]
const config = { chrome: { label: 'Chrome', color: 'red' } }

describe('buildPieSlices', () => {
  test('names each slice by its nameKey field', () => {
    const slices = buildPieSlices(data, 'visitors', 'browser', config, 100, 100, 0, 0.8, 0)
    expect(slices.map(s => s.name)).toEqual(['chrome', 'safari'])
    expect(slices.map(s => s.fill)).toEqual(['red', 'currentColor'])
  })

  test('leaves every slice unnamed without a nameKey (#2573)', () => {
    const slices = buildPieSlices(data, 'visitors', undefined, config, 100, 100, 0, 0.8, 0)
    expect(slices.map(s => s.name)).toEqual(['', ''])
    expect(slices.map(s => s.fill)).toEqual(['currentColor', 'currentColor'])
  })
})
