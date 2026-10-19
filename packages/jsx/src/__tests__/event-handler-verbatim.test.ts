/**
 * Event handlers reach `addEventListener` verbatim (#3538).
 *
 * The emitters used to rewrite an arrow handler into block form by splitting
 * its text at the first `=>`, which broke any handler whose first `=>` is not
 * the outer arrow's (a conditional choosing between arrows, a default
 * parameter holding an arrow). `addEventListener` ignores a listener's return
 * value, so the handler is now passed through as written, in every position
 * a listener is emitted from.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()
const transpiler = new Bun.Transpiler({ loader: 'js' })

const HANDLERS: Record<string, string> = {
  'conditional between arrows': '(n() > 5 ? () => setN(0) : () => setN(n() + 1))',
  'default parameter holding an arrow': '(e = { step: () => 2 }) => setN(n() + e.step())',
  'comma sequence': 'setN(1), () => setN(n() + 1)',
  'destructured parameter': '({ currentTarget }) => setN(currentTarget ? n() + 1 : 0)',
  'expression-bodied arrow': '() => setN(n() + 1)',
}

/** Wraps one handler in each position a listener is emitted from. */
function positions(handler: string): Record<string, string> {
  return {
    'top-level element': `<button onClick={${handler}}>{n()}</button>`,
    'conditional branch': `<div>{n() > 0 ? <button onClick={${handler}}>a</button> : <span>none</span>}</div>`,
    'loop row': `<ul>{items().map(item => <li key={item}><button onClick={${handler}}>{item}</button></li>)}</ul>`,
  }
}

function compile(body: string): string {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function T() {
      const [n, setN] = createSignal(0)
      const [items] = createSignal(['a', 'b'])
      return ${body}
    }
  `
  const result = compileJSX(source, 'T.tsx', { adapter })
  expect(result.errors).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('event handlers are emitted verbatim (#3538)', () => {
  for (const [shape, handler] of Object.entries(HANDLERS)) {
    for (const [position, body] of Object.entries(positions(handler))) {
      test(`${shape} in a ${position} compiles to valid JS`, () => {
        const js = compile(body)
        expect(() => transpiler.transformSync(js)).not.toThrow()
      })
    }
  }

  test('a top-level handler appears unchanged as the listener argument', () => {
    const handler = HANDLERS['conditional between arrows']
    const js = compile(positions(handler)['top-level element'])
    expect(js).toContain(`.addEventListener('click', ${handler})`)
  })

  test('a comma sequence stays one listener argument', () => {
    const js = compile(positions(HANDLERS['comma sequence'])['top-level element'])
    expect(js).toContain(`.addEventListener('click', (setN(1), () => setN(n() + 1)))`)
  })
})
