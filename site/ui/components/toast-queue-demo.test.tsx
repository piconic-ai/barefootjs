import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToTest } from '@barefootjs/test'
import type { TestNode } from '@barefootjs/test'

const source = readFileSync(resolve(__dirname, 'toast-queue-demo.tsx'), 'utf-8')
const result = renderToTest(source, 'toast-queue-demo.tsx', 'ToastQueueDemo')

function allNodes(node: TestNode): TestNode[] {
  return [node, ...node.children.flatMap(allNodes)]
}

describe('ToastQueueDemo structure', () => {
  test('compiles as a client component with queue state primitives', () => {
    expect(result.errors).toEqual([])
    expect(result.isClient).toBe(true)
    expect(result.signals).toEqual(['toasts', 'paused', 'eventLog'])
    expect(result.memos).toEqual(['activeCount', 'exitingCount', 'topVariant'])
    expect(result.effects).toBe(3)
  })

  test('composes the existing toast UI components', () => {
    expect(result.find({ componentName: 'ToastProvider' })).not.toBeNull()
    expect(result.find({ componentName: 'Toast' })).not.toBeNull()
    expect(result.find({ componentName: 'ToastTitle' })).not.toBeNull()
    expect(result.find({ componentName: 'ToastDescription' })).not.toBeNull()
    expect(result.find({ componentName: 'ToastClose' })).not.toBeNull()
  })

  test('renders queue controls with stable data-slot attributes', () => {
    const buttons = result.findAll({ componentName: 'Button' })

    expect(buttons).toHaveLength(3)
    expect(buttons.map(button => button.props['data-slot'])).toEqual([
      'add-batch',
      'add-urgent',
      'clear-queue',
    ])
  })

  test('renders stats, source queue, empty state, and event log regions', () => {
    const nodes = allNodes(result.root)
    const dataSlots = nodes
      .map(node => node.props['data-slot'])
      .filter(Boolean)

    expect(dataSlots).toContain('queue-stats')
    expect(dataSlots).toContain('queue-source')
    expect(dataSlots).toContain('empty-queue')
    expect(dataSlots).toContain('queue-row')
    expect(dataSlots).toContain('event-log')
  })

  test('toast content includes variant metadata and title/description components', () => {
    const nodes = allNodes(result.root)
    const dataSlots = nodes
      .map(node => node.props['data-slot'])
      .filter(Boolean)

    expect(dataSlots).toContain('toast-kind')
    expect(dataSlots).toContain('toast-id')
    expect(dataSlots).toContain('toast-order')
    expect(dataSlots).toContain('toast-time')
    expect(result.find({ componentName: 'ToastTitle' })).not.toBeNull()
    expect(result.find({ componentName: 'ToastDescription' })).not.toBeNull()
  })
})
