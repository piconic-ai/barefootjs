import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToTest } from '@barefootjs/test'

// IR-level test for the JSX-native Controls (#1081 step 4). Verifies:
// - the four control buttons are present (zoom in / zoom out / fit view /
//   lock toggle), each gated by per-control booleans
// - the lock icon is signal-driven (interactive() ? unlock : lock)
const source = readFileSync(resolve(__dirname, '../components/controls.tsx'), 'utf-8')

describe('Controls JSX shape (#1081 step 4)', () => {
  const result = renderToTest(source, 'controls.tsx', 'Controls')

  test('JSX → IR pipeline reports no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('component is recognized as a client component', () => {
    expect(result.isClient).toBe(true)
  })

  test('declares interactive signal for lock toggle', () => {
    expect(result.signals).toContain('interactive')
  })

  test('declares per-prop default memos', () => {
    expect(result.memos).toContain('position')
    expect(result.memos).toContain('showZoom')
    expect(result.memos).toContain('showFitView')
    expect(result.memos).toContain('showInteractive')
    expect(result.memos).toContain('containerStyle')
  })

  test('renders the controls container div', () => {
    const container = result.find({ tag: 'div' })
    expect(container).not.toBeNull()
    expect(container!.classes).toContain('bf-flow__controls')
  })

  test('renders <button> elements with controls-button class', () => {
    const buttons = result.findAll({ tag: 'button' })
    expect(buttons.length).toBeGreaterThanOrEqual(4)
    for (const btn of buttons) {
      expect(btn.classes).toContain('bf-flow__controls-button')
      expect(btn.props['type']).toBe('button')
    }
  })

  test('button titles cover the four control actions', () => {
    const buttons = result.findAll({ tag: 'button' })
    const titles = buttons.map(b => b.props['title']).filter(Boolean) as string[]
    expect(titles).toContain('Zoom in')
    expect(titles).toContain('Zoom out')
    expect(titles).toContain('Fit view')
    expect(titles).toContain('Toggle interactivity')
  })
})
