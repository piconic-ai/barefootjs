/**
 * The node drag handler in `attachFlowSubsystems` calls the drag callbacks:
 * `onNodeDragStart` on the first move, `onNodeDrag` on every move and
 * `onNodeDragStop` on release, each with the node where it is by then. A
 * press without a move is a click and calls none of them, even when the
 * browser sends a pointermove that does not move the node.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register()
})

async function setup() {
  // Lazy import so happy-dom globals are in place before xyflow loads.
  const { attachFlowSubsystems } = await import('../flow-subsystems')
  const { createFlowStore } = await import('../store')

  const calls: [string, string, number, number, number][] = []
  const record =
    (name: string) =>
    (_e: MouseEvent, node: { id: string; position: { x: number; y: number } }, nodes: unknown[]) =>
      calls.push([name, node.id, node.position.x, node.position.y, nodes.length])
  const options = {
    nodes: [{ id: 'a', position: { x: 10, y: 20 }, data: {} }],
    onNodeDragStart: record('start'),
    onNodeDrag: record('drag'),
    onNodeDragStop: record('stop'),
  }
  const el = document.createElement('div')
  el.className = 'bf-flow'
  document.body.appendChild(el)
  // biome-ignore lint/suspicious/noExplicitAny: minimal options for a unit test
  const store = createFlowStore(options as any)
  // biome-ignore lint/suspicious/noExplicitAny: minimal props for a unit test
  attachFlowSubsystems(el, store as any, options as any)

  const node = document.createElement('div')
  node.className = 'bf-flow__node'
  node.dataset.id = 'a'
  el.appendChild(node)

  const pointer = (type: string, target: EventTarget, x: number, y: number) =>
    target.dispatchEvent(
      new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX: x, clientY: y }),
    )
  return { calls, store, node, el, pointer }
}

describe('node drag callbacks', () => {
  test('start on the first move, drag on every move, stop on release', async () => {
    const { calls, store, node, el, pointer } = await setup()
    pointer('pointerdown', node, 100, 100)
    expect(calls).toEqual([])
    pointer('pointermove', el, 105, 100)
    pointer('pointermove', el, 110, 103)
    pointer('pointerup', el, 110, 103)
    expect(calls).toEqual([
      ['start', 'a', 15, 20, 1],
      ['drag', 'a', 15, 20, 1],
      ['drag', 'a', 20, 23, 1],
      ['stop', 'a', 20, 23, 1],
    ])
    expect(store.dragging()).toBe(false)
  })

  test('a press without a move calls none of them', async () => {
    const { calls, node, el, pointer } = await setup()
    pointer('pointerdown', node, 100, 100)
    pointer('pointerup', el, 100, 100)
    expect(calls).toEqual([])
  })

  test('a pointermove that does not move the node starts no drag', async () => {
    const { calls, node, el, pointer } = await setup()
    // Pen pressure or tilt, or touch, sends pointermove at the same place.
    pointer('pointerdown', node, 100, 100)
    pointer('pointermove', el, 100, 100)
    pointer('pointerup', el, 100, 100)
    expect(calls).toEqual([])
  })
})
