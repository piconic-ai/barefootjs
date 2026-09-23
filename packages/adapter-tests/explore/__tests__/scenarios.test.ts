import { describe, test, expect } from 'bun:test'
import { renderToTest, type TestNode } from '@barefootjs/test'
import { SCENARIOS } from '../scenarios'
import { assertScenarioShape } from '../scenario'
import { keyedLoopInline } from '../scenarios/keyed-loop-inline'
import { childPropLoop } from '../scenarios/child-prop-loop'

/**
 * IR-level smoke for every scenario in the roster (#3046). Runs in plain
 * `bun test` on every PR, milliseconds, no browser: if the compiler did
 * not even wire an action button's handler to the state setter, the
 * scheduled Playwright sweep (`e2e/explore.playwright.ts`) has nothing to
 * measure and its failure would be misattributed to reconciliation. This
 * is the proposal's "only the TSX path fails → analyzer / source-to-IR
 * problem" classification, obtained without a second IR-builder input
 * path: a scenario that fails HERE is an analyzer finding; one that
 * passes here and fails in the browser is a lowering / runtime finding.
 */

const setterOf = (getter: string) => `set${getter[0].toUpperCase()}${getter.slice(1)}`

function walk(node: TestNode, visit: (n: TestNode) => void): void {
  visit(node)
  for (const child of node.children) walk(child, visit)
}

describe('explore scenarios — IR smoke', () => {
  for (const scenario of SCENARIOS) {
    describe(scenario.id, () => {
      test('has a well-formed definition', () => {
        expect(() => assertScenarioShape(scenario)).not.toThrow()
      })

      const result = renderToTest(scenario.source, `${scenario.componentName}.tsx`, scenario.componentName)

      test('compiles to IR as a client component with the declared state signals', () => {
        expect(result.errors).toEqual([])
        expect(result.isClient).toBe(true)
        for (const signal of scenario.stateSignals) expect(result.signals).toContain(signal)
      })

      test('renders exactly one button per action', () => {
        const buttons = result.findAll({ tag: 'button' })
        const byAction = new Map(buttons.map((b: TestNode) => [b.props['data-action'], b]))
        expect([...byAction.keys()].sort()).toEqual([...scenario.actions].sort())
        expect(buttons.length).toBe(scenario.actions.length)
      })

      for (const action of scenario.actions) {
        if (scenario.indirectActions?.includes(action)) continue
        test(`[${action}] click handler reaches a state setter`, () => {
          const button = result.findAll({ tag: 'button' }).find((b: TestNode) => b.props['data-action'] === action)!
          const handler = button.onClick
          expect(handler).toBeDefined()
          const stateSetters = scenario.stateSignals.map(setterOf)
          expect(handler!.setters.some((s: string) => stateSetters.includes(s))).toBe(true)
        })
      }
    })
  }

  test('keyed-loop-inline: the loop lives in the same component as the signal', () => {
    const result = renderToTest(keyedLoopInline.source, 'KeyedLoopInline.tsx', keyedLoopInline.componentName)
    const loops: TestNode[] = []
    walk(result.root, n => {
      if (n.type === 'loop') loops.push(n)
    })
    expect(loops.length).toBe(1)
    expect(loops[0].find({ tag: 'li' })).not.toBeNull()
  })

  test('child-prop-loop: the loop is owned by the child, fed through a prop', () => {
    const parent = renderToTest(childPropLoop.source, 'ChildPropLoop.tsx', childPropLoop.componentName)
    const parentLoops: TestNode[] = []
    walk(parent.root, n => {
      if (n.type === 'loop') parentLoops.push(n)
    })
    expect(parentLoops).toEqual([])
    const child = parent.find({ componentName: 'ItemList' })
    expect(child).not.toBeNull()
    expect(child!.props['data']).toBe('data()')

    const childIr = renderToTest(childPropLoop.source, 'ChildPropLoop.tsx', 'ItemList')
    const childLoops: TestNode[] = []
    walk(childIr.root, n => {
      if (n.type === 'loop') childLoops.push(n)
    })
    expect(childLoops.length).toBe(1)
  })
})
