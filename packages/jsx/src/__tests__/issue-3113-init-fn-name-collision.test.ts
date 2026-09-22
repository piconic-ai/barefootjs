/**
 * Regression test for #3113: a component literally named `Child` compiled
 * a top-level `export function initChild(...)` — the compiler's own
 * `init<Name>` naming convention (`generate-init.ts`) — into the SAME
 * module that also `import { initChild } from '@barefootjs/client/runtime'`
 * (the runtime dispatcher a parent calls to hand a live prop getter to a
 * mounted child, `registry.ts`'s `initChild`). Two top-level declarations
 * of the same identifier in one ES module is a hard `SyntaxError` under
 * real module semantics — verified against a raw `<script type="module">`
 * load, the same unbundled-ESM shape `bf build` ships (see
 * `initFunctionName`'s docstring, `ir-to-client-js/utils.ts`) — so the
 * ENTIRE hydration script failed to parse, breaking every action on the
 * page, not just the child's own reactive text. `initFunctionName` now
 * disambiguates the generated declaration (`initChild$`) whenever it would
 * collide with a `RUNTIME_IMPORT_CANDIDATES` entry, and every emission
 * site (`generate-init.ts`, `emit-registration.ts`, `ir-to-client-js/
 * index.ts`'s static-template stub path, `source-map.ts`) computes the
 * SAME name so the declaration and its `hydrate(...)` registration always
 * agree.
 *
 * The bounded state-space exploration scenario
 * (`packages/adapter-tests/explore/scenarios/child-prop-slots.ts`) is the
 * end-to-end regression armor (real browser, real ES module load); this
 * file pins the compiler-unit half: the generated code must neither carry
 * a literal `export function initChild(` declaration nor otherwise emit
 * a duplicate top-level `initChild` binding, whenever the component named
 * `Child` needs BOTH its own compiled init (reactive prop-derived content)
 * AND the runtime's `initChild` (because some ancestor mounts a further
 * child by name).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import ts from 'typescript'

const adapter = new TestAdapter()

function getClientJs(source: string, filename: string): string {
  const result = compileJSX(source, filename, { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

/** No top-level identifier is declared more than once (mirrors real ESM semantics). */
function assertNoDuplicateTopLevelDeclarations(code: string, filename: string): void {
  const sourceFile = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const seen = new Set<string>()
  const dupes = new Set<string>()
  const noteName = (name: string) => {
    if (seen.has(name)) dupes.add(name)
    seen.add(name)
  }
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt) && stmt.importClause?.namedBindings && ts.isNamedImports(stmt.importClause.namedBindings)) {
      for (const spec of stmt.importClause.namedBindings.elements) noteName(spec.name.text)
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      noteName(stmt.name.text)
    }
  }
  expect([...dupes]).toEqual([])
}

describe('#3113: init<Name> disambiguated against runtime import names', () => {
  test('a component literally named `Child` with a reactive prop-derived text child does not collide with the imported runtime initChild', () => {
    // Mirrors the issue's exploration scenario: an inlined (non-"use
    // client") `Child` reads a destructured object prop's field as text,
    // and the "use client" parent passes it a live signal-derived value.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Data = { label: string }

      function Child({ data }: { data: Data }) {
        return <p aria-label="label">{data.label}</p>
      }

      export function ChildPropSlots({ initial }: { initial: { data: Data } }) {
        const [data, setData] = createSignal<Data>(initial.data)
        return (
          <div>
            <Child data={data()} />
            <button onClick={() => setData({ label: 'loaded' })}>load</button>
          </div>
        )
      }
    `
    const clientJs = getClientJs(source, 'ChildPropSlots.tsx')

    // The exact defect: a bare `export function initChild(` declaration
    // sharing a module with `import { ..., initChild, ... }`.
    expect(clientJs).not.toMatch(/\bexport function initChild\(/)
    // The disambiguated name is used consistently for both the
    // declaration and its `hydrate(...)` registration.
    expect(clientJs).toContain('export function initChild$(')
    expect(clientJs).toMatch(/hydrate\('Child[^']*',\s*\{\s*init:\s*initChild\$,/)
    // The runtime dispatcher call (a DIFFERENT `initChild` — the import —
    // invoked from the parent's own init to deliver live props) is
    // untouched.
    expect(clientJs).toMatch(/\binitChild\('Child[_a-f0-9]*',/)

    assertNoDuplicateTopLevelDeclarations(clientJs, 'ChildPropSlots.client.js')
  })

  test('a component named anything else keeps the plain init<Name> convention (no needless disambiguation)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Data = { label: string }

      function Leaf({ data }: { data: Data }) {
        return <p aria-label="label">{data.label}</p>
      }

      export function Parent({ initial }: { initial: { data: Data } }) {
        const [data, setData] = createSignal<Data>(initial.data)
        return (
          <div>
            <Leaf data={data()} />
            <button onClick={() => setData({ label: 'loaded' })}>load</button>
          </div>
        )
      }
    `
    const clientJs = getClientJs(source, 'Parent.tsx')
    expect(clientJs).toContain('export function initLeaf(')
    expect(clientJs).not.toContain('initLeaf$')
  })
})
