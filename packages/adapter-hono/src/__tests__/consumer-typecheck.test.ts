/**
 * Regression for piconic-ai/barefootjs#2559: type-check a CONSUMER program
 * that imports a compiled template — the coverage gap that let
 * `wrapWithInlineScripts`'s `unknown` return ship. Every generated
 * component returns that call as its body, so an `unknown` return made
 * every island fail TS2786 ("cannot be used as a JSX component") in any
 * type-checking consumer (hit by sora's 0.26.2 → 0.31.0 migration), while
 * nothing in-repo ever ran tsc over a program shaped like a consumer app.
 *
 * The test compiles a real `'use client'` component with a non-empty
 * `scriptAssets` (so the emitted template wraps its return in
 * `wrapWithInlineScripts`), writes it plus a scaffold-shaped `server.tsx`
 * that renders the island, and type-checks the pair with the scaffold's
 * own options (`strict`, `jsxImportSource: '@barefootjs/hono/jsx'`).
 */
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { compileJSX } from '@barefootjs/jsx'
import { HonoAdapter } from '../adapter/index.ts'

const HERE = resolve(import.meta.dir)

const COMPONENT_SOURCE = `"use client"

import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`

const SERVER_SOURCE = `import { Counter } from './components/Counter.tsx'

export function Page() {
  return (
    <div>
      <Counter />
    </div>
  )
}
`

describe('consumer program type-check (#2559)', () => {
  test('a compiled template used as a JSX component type-checks clean', () => {
    const result = compileJSX(COMPONENT_SOURCE, '/virtual/Counter.tsx', {
      adapter: new HonoAdapter(),
      // Non-empty so the emitted template's component body returns
      // wrapWithInlineScripts(...) — the #2559 shape.
      scriptAssets: ['/static/components/assets/Counter.js'],
    })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const template = result.files.find(f => f.type === 'markedTemplate')?.content
    expect(template).toContain('wrapWithInlineScripts(')

    // Inside the package so module resolution reaches the workspace's
    // node_modules (hono, @barefootjs/*) exactly like a scaffolded app's.
    const tmp = mkdtempSync(join(HERE, '.consumer-typecheck-'))
    try {
      mkdirSync(join(tmp, 'components'), { recursive: true })
      writeFileSync(join(tmp, 'components', 'Counter.tsx'), template!)
      writeFileSync(join(tmp, 'server.tsx'), SERVER_SOURCE)

      const program = ts.createProgram(
        [join(tmp, 'server.tsx')],
        {
          strict: true,
          noEmit: true,
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          jsx: ts.JsxEmit.ReactJSX,
          jsxImportSource: '@barefootjs/hono/jsx',
          lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
          allowImportingTsExtensions: true,
          // Consumer apps skipLibCheck too; TS2786 fires in OUR files
          // regardless, which is exactly what this test pins.
          skipLibCheck: true,
        },
      )
      const diagnostics = ts.getPreEmitDiagnostics(program).map(d => ({
        code: d.code,
        file: d.file?.fileName ?? '',
        message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
      }))

      // TS2786 = "'X' cannot be used as a JSX component." — the #2559
      // failure. Assert none anywhere in the consumer program.
      expect(diagnostics.filter(d => d.code === 2786)).toEqual([])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
