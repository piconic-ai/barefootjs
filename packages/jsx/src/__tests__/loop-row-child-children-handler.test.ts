/**
 * #3607: an event handler on an element forwarded as a loop-row child
 * component's own `children` (`<Chip key={o.id}><button onClick={…}/></Chip>`).
 * `collectLoopChildBindings` collects the event into the loop's
 * `bindings.events`, but the component-root loop builder never read it, and
 * a component-root loop has no delegation pass — so the handler reached no
 * part of the client JS. The builder now resolves those events into
 * `rowEvents`, and each row (hydrated and client-built) attaches them
 * directly, the same per-row listener the composite row uses. The static
 * array twin (`single-comp` child init) attaches them to each hydrated row.
 *
 * Conformance coverage: `loop-row-child-children-handler`.
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsOf(body: string): string {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    function Chip({ children }: { children?: any }) {
      return <span class="chip">{children}</span>
    }
    export function Picker() {
      const [rows, setRows] = createSignal([{ id: 'a', label: 'A' }])
      const [picked, setPicked] = createSignal('')
      const pick = (id: string) => setPicked(id)
      return <div><p>{picked()}</p>${body}</div>
    }
  `
  const result = compileJSX(source, 'Picker.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const js = result.files.find(f => f.type === 'clientJs')!.content
  const diagnostics = ts.transpileModule(js, {
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.Latest },
  }).diagnostics ?? []
  expect(diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error)).toHaveLength(0)
  return js
}

/** The per-row listener block, as attached to the hydrated and the client-built row. */
function rowListener(elVar: '__existing' | '__csrEl', handler: string): string {
  return `{ const __e = qsa(${elVar}, '[bf="^s3"]'); if (__e) __e.addEventListener('click', ${handler}) }`
}

describe('event handler in forwarded loop-row child children (#3607)', () => {
  test('a handler reading the row item is attached to the hydrated and the client-built row', () => {
    const js = clientJsOf(
      '{rows().map(o => (<Chip key={o.id}><button onClick={() => pick(o.id)}>{o.label}</button></Chip>))}',
    )
    expect(js).toContain(rowListener('__existing', '() => pick(o().id)'))
    expect(js).toContain(rowListener('__csrEl', '() => pick(o().id)'))
    // Attached after the row component is initialised / created.
    expect(js.indexOf(rowListener('__existing', '() => pick(o().id)')))
      .toBeGreaterThan(js.indexOf(`initChild('Chip`))
    expect(js.indexOf(rowListener('__csrEl', '() => pick(o().id)')))
      .toBeGreaterThan(js.indexOf('const __csrEl = createComponent('))
  })

  test('a handler reading the row index reads it through the accessor', () => {
    const js = clientJsOf(
      '{rows().map((o, i) => (<Chip key={o.id}><button onClick={() => pick(o.id + i)}>{o.label}</button></Chip>))}',
    )
    expect(js).toContain(rowListener('__existing', '() => pick(o().id + i())'))
    expect(js).toContain(rowListener('__csrEl', '() => pick(o().id + i())'))
  })

  test('a handler reading destructured row bindings reads the row item accessor', () => {
    const js = clientJsOf(
      '{rows().map(({ id, label }, i) => (<Chip key={id}><button onClick={() => pick(id + i)}>{label}</button></Chip>))}',
    )
    expect(js).toContain(rowListener('__existing', '() => pick(__bfItem().id + i())'))
    expect(js).toContain(rowListener('__csrEl', '() => pick(__bfItem().id + i())'))
  })

  test('a row with only a forwarded handler leaves the simple renderItem shape', () => {
    // No reactive text: the handler alone must force the SSR/CSR split, since
    // the simple shape returns straight from initChild/createComponent.
    const js = clientJsOf(
      `{rows().map(o => (<Chip key={o.id}><button onClick={() => pick(o.id)}>pick</button></Chip>))}`,
    )
    expect(js).not.toContain('if (__existing) { initChild(')
    expect(js).toContain(`{ const __e = qsa(__existing, '[bf="^s2"]'); if (__e) __e.addEventListener('click', () => pick(o().id)) }`)
    expect(js).toContain(`{ const __e = qsa(__csrEl, '[bf="^s2"]'); if (__e) __e.addEventListener('click', () => pick(o().id)) }`)
  })

  test('a module-const array attaches the handler to each hydrated row, unwrapped', () => {
    // A static array has no delegation pass for a component row either; the
    // forEach binds the plain item and index, so the handler is not
    // accessor-wrapped.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Chip({ children }: { children?: any }) {
        return <span class="chip">{children}</span>
      }
      const OPTS = [{ id: 'a', label: 'A' }]
      export function Picker() {
        const [picked, setPicked] = createSignal('')
        return <div><p>{picked()}</p>{OPTS.map(({ id, label }, i) => (<Chip key={id}><button onClick={() => setPicked(id + i)}>{label}</button></Chip>))}</div>
      }
    `
    const result = compileJSX(source, 'Picker.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')!.content
    expect(ts.transpileModule(js, {
      reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.Latest },
    }).diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error) ?? []).toHaveLength(0)
    expect(js).toContain(`__childScopes.forEach((childScope, i) => {
      const { id, label } = OPTS[i]
      initChild('Chip__`)
    expect(js).toContain(`{ const __e = qsa(childScope, '[bf="^s3"]'); if (__e) __e.addEventListener('click', () => setPicked(id + i)) }`)
  })

  test('the direct-child row keeps its delegated dispatcher (control)', () => {
    const js = clientJsOf(
      '{rows().map(o => (<div key={o.id}><button onClick={() => pick(o.id)}>{o.label}</button></div>))}',
    )
    expect(js).toContain(`const s3El = target.closest('[bf="s3"]')`)
    expect(js).toContain(';(() => pick(o.id))(__bfEvt)')
  })
})
