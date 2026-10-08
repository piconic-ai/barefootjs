/**
 * The compiler core must not depend on the Node `process` global.
 *
 * The site playground bundles `@barefootjs/jsx` into a browser Worker
 * (site/core/playground/worker.ts) where `process` does not exist, so a bare
 * `process.env.X` read anywhere on the compile path throws ReferenceError
 * and takes the whole playground down ("Build failed" on first load).
 *
 * This test runs the exact pipeline the worker runs, with `globalThis.process`
 * removed for the duration of the compile, so any new Node-only global read
 * on that path fails here instead of in production.
 */

import { describe, test, expect } from 'bun:test'
import {
  analyzeComponent,
  buildMetadata,
  jsxToIR,
  generateClientJs,
  analyzeClientNeeds,
  listComponentFunctions,
  type ComponentIR,
} from '../index'

const SOURCE = `'use client'

import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={() => setCount(count() + 1)}>+1</button>
    </div>
  )
}
`

const VIRTUAL_PATH = '/playground/component.tsx'

/** Mirrors site/core/playground/worker.ts `compile()`. */
function compileLikeThePlayground(source: string): string {
  const names = listComponentFunctions(source, VIRTUAL_PATH)
  const entryName = names[names.length - 1]
  const ctx = analyzeComponent(source, VIRTUAL_PATH, entryName)
  expect(ctx.errors.filter((e) => e.severity === 'error')).toEqual([])
  const root = jsxToIR(ctx)
  expect(root).toBeTruthy()
  const ir: ComponentIR = {
    version: '0.1',
    metadata: buildMetadata(ctx),
    root: root!,
    errors: [],
  }
  ir.metadata.clientAnalysis = analyzeClientNeeds(ir)
  return generateClientJs(ir)
}

function withoutNodeProcess<T>(fn: () => T): T {
  const g = globalThis as { process?: unknown }
  const saved = g.process
  // `delete` (not `= undefined`) so a bare `process` identifier throws
  // ReferenceError exactly as it does in a browser Worker.
  delete g.process
  try {
    return fn()
  } finally {
    g.process = saved
  }
}

describe('compiling without the Node `process` global', () => {
  test('the playground compile pipeline produces client JS', () => {
    const clientJs = withoutNodeProcess(() => compileLikeThePlayground(SOURCE))
    expect(clientJs).toContain('Counter')
  })
})
