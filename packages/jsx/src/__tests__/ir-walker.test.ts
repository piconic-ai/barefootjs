import { describe, expect, test } from 'bun:test'
import { walkIR } from '../ir-to-client-js/walker'
import type { IRNode } from '../types'

const loc = { file: 't.tsx', start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } as any

function elem(children: IRNode[] = [], slotId: string | null = null): IRNode {
  return {
    type: 'element',
    tag: 'div',
    attrs: [],
    events: [],
    ref: null,
    children,
    slotId,
    needsScope: false,
    loc,
  }
}

function text(value: string): IRNode {
  return { type: 'text', value, loc }
}

function expr(e: string): IRNode {
  return { type: 'expression', expr: e, typeInfo: null, reactive: false, slotId: null, loc }
}

function cond(whenTrue: IRNode, whenFalse: IRNode): IRNode {
  return {
    type: 'conditional',
    condition: 'c',
    conditionType: null,
    reactive: false,
    whenTrue,
    whenFalse,
    slotId: null,
    loc,
  }
}

function loop(children: IRNode[]): IRNode {
  return {
    type: 'loop',
    array: 'items',
    arrayType: null,
    itemType: null,
    param: 'i',
    index: null,
    key: null,
    children,
    slotId: null,
    markerId: 'l0',
    loc,
    isStaticArray: false,
    depth: 0,
  }
}

describe('walkIR', () => {
  test('visits all element nodes with default descent when no visitor for non-element kinds', () => {
    const root = elem([elem([text('a'), elem()]), elem()])
    const visited: string[] = []
    walkIR(root, null, {
      element: ({ node, descend }) => {
        visited.push(`element(children=${node.children.length})`)
        descend()
      },
    })
    expect(visited).toEqual([
      'element(children=2)',
      'element(children=2)',
      'element(children=0)',
      'element(children=0)',
    ])
  })

  test('omitting a callback still descends with the same scope', () => {
    // No element callback → walker auto-descends into element children.
    const root = elem([elem([expr('x')])])
    const seen: string[] = []
    walkIR(root, null, {
      expression: ({ node }) => {
        seen.push(node.expr)
      },
    })
    expect(seen).toEqual(['x'])
  })

  test("returning without calling descend halts recursion for that subtree", () => {
    const root = elem([elem([text('deep')])])
    const visited: number[] = []
    walkIR(root, 0, {
      element: ({ descend, scope }) => {
        visited.push(scope)
        if (scope < 1) descend(scope + 1)  // only go one level in
      },
    })
    expect(visited).toEqual([0, 1])
  })

  test('scope updates propagate per descent call', () => {
    const root = elem([elem([elem()])])
    const depths: number[] = []
    walkIR(root, 0, {
      element: ({ scope, descend }) => {
        depths.push(scope)
        descend(scope + 1)
      },
    })
    expect(depths).toEqual([0, 1, 2])
  })

  test('conditional visitor can descend surgically with ctx.walk', () => {
    const root = cond(
      elem([expr('true-branch')]),
      elem([expr('false-branch')]),
    )
    const trueOnly: string[] = []
    walkIR(root, null, {
      conditional: ({ node, walk }) => {
        walk(node.whenTrue)  // skip the whenFalse branch entirely
      },
      expression: ({ node }) => {
        trueOnly.push(node.expr)
      },
    })
    expect(trueOnly).toEqual(['true-branch'])
  })

  test('loop default descent covers loop children', () => {
    const root = loop([elem([expr('inside-loop')])])
    const exprs: string[] = []
    walkIR(root, null, {
      expression: ({ node }) => exprs.push(node.expr),
    })
    expect(exprs).toEqual(['inside-loop'])
  })

  test('component visitor exposes descendJsxChildren', () => {
    const root: IRNode = {
      type: 'component',
      name: 'Card',
      props: [
        {
          name: 'header',
          value: { kind: 'jsx-children', children: [expr('in-jsx-prop')] },
        } as any,
      ],
      propsType: null,
      children: [text('inside-component')],
      template: '',
      slotId: null,
      loc,
    }
    const expressions: string[] = []
    const texts: string[] = []
    walkIR(root, null, {
      component: ({ descend, descendJsxChildren }) => {
        descend()
        descendJsxChildren()
      },
      expression: ({ node }) => expressions.push(node.expr),
      text: ({ node }) => texts.push(node.value),
    })
    expect(texts).toEqual(['inside-component'])
    expect(expressions).toEqual(['in-jsx-prop'])
  })

  test('exhaustive switch — unknown node kind throws', () => {
    const bogus = { type: 'mystery' } as unknown as IRNode
    expect(() => walkIR(bogus, null, {})).toThrow(/unhandled IRNode kind/)
  })
})
