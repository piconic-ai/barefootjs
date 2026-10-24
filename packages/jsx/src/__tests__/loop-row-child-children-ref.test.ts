/**
 * #3612: a `ref` callback on an element forwarded as a loop-row child
 * component's own `children` (`<Chip key={o.id}><input ref={…}/></Chip>`).
 * `collectLoopChildBindings` collects the ref into the loop's
 * `bindings.refs` and the component-root loop builder resolves it into the
 * plan's `childRefs`, but `stringifyComponentLoop` never emitted them — so
 * the callback never ran. Each row (hydrated and client-built) now invokes
 * them against its own element, the same per-row ref call the composite row
 * uses. The static-array twin already invoked them through the static
 * loop's own ref pass.
 *
 * Conformance coverage: `loop-row-child-children-ref`.
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function compileClientJs(source: string): string {
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

function clientJsOf(body: string): string {
  return compileClientJs(`
    'use client'
    import { createSignal } from '@barefootjs/client'
    function Chip({ children }: { children?: any }) {
      return <span class="chip">{children}</span>
    }
    export function Picker() {
      const [rows, setRows] = createSignal([{ id: 'a', label: 'A' }])
      const register = (id: string, el: HTMLElement) => { el.addEventListener('click', () => console.log(id)) }
      return <div>${body}</div>
    }
  `)
}

/** The per-row ref call, as made on the hydrated and the client-built row. */
function rowRef(elVar: '__existing' | '__csrEl', slot: string, callback: string): string {
  return `{ const __rf_${slot} = qsa(${elVar}, '[bf="^${slot}"]')\n${elVar === '__existing' ? '      ' : '    '}if (__rf_${slot}) (${callback})?.(__rf_${slot}) }`
}

describe('ref callback in forwarded loop-row child children (#3612)', () => {
  test('a ref reading the row item runs on the hydrated and the client-built row', () => {
    const js = clientJsOf('{rows().map(o => (<Chip key={o.id}><input ref={el => register(o.id, el)} /></Chip>))}')
    const hydrated = rowRef('__existing', 's0', 'el => register(o().id, el)')
    const created = rowRef('__csrEl', 's0', 'el => register(o().id, el)')
    expect(js).toContain(hydrated)
    expect(js).toContain(created)
    // A ref-only row leaves the simple renderItem shape, and the call comes
    // after the row component is initialised / created.
    expect(js).not.toContain('if (__existing) { initChild(')
    expect(js.indexOf(hydrated)).toBeGreaterThan(js.indexOf(`initChild('Chip`))
    expect(js.indexOf(created)).toBeGreaterThan(js.indexOf('const __csrEl = createComponent('))
  })

  test('a ref reading the row index reads it through the accessor', () => {
    const js = clientJsOf('{rows().map((o, i) => (<Chip key={o.id}><input ref={el => register(o.id + i, el)} /></Chip>))}')
    expect(js).toContain(rowRef('__existing', 's0', 'el => register(o().id + i(), el)'))
    expect(js).toContain(rowRef('__csrEl', 's0', 'el => register(o().id + i(), el)'))
  })

  test('a ref on a nested element reading destructured row bindings reads the row item accessor', () => {
    const js = clientJsOf(
      '{rows().map(({ id, label }, i) => (<Chip key={id}><label>{label}<input ref={el => register(id + i, el)} /></label></Chip>))}',
    )
    expect(js).toContain(rowRef('__existing', 's1', 'el => register(__bfItem().id + i(), el)'))
    expect(js).toContain(rowRef('__csrEl', 's1', 'el => register(__bfItem().id + i(), el)'))
  })

  test('a ref beside a forwarded handler runs after the handler is attached', () => {
    const js = clientJsOf(
      '{rows().map(o => (<Chip key={o.id}><button onClick={() => register(o.id, document.body)}>x</button><input ref={el => register(o.id, el)} /></Chip>))}',
    )
    const hydratedRef = rowRef('__existing', 's1', 'el => register(o().id, el)')
    expect(js).toContain(hydratedRef)
    expect(js.indexOf(hydratedRef)).toBeGreaterThan(js.indexOf(`{ const __e = qsa(__existing, '[bf="^s0"]')`))
  })

  test('a module-const array invokes the ref on each row, unwrapped (control)', () => {
    const js = compileClientJs(`
      'use client'
      function Chip({ children }: { children?: any }) {
        return <span class="chip">{children}</span>
      }
      const OPTS = [{ id: 'a' }]
      export function Picker() {
        const register = (id: string, el: HTMLElement) => { el.addEventListener('click', () => console.log(id)) }
        return <div>{OPTS.map((o, i) => (<Chip key={o.id}><input ref={el => register(o.id + i, el)} /></Chip>))}</div>
      }
    `)
    expect(js).toContain(`if (__rf_s0) (el => register(o.id + i, el))?.(__rf_s0) }`)
    expect(js).not.toContain('o().id')
  })

  test("a ref inside a non-loop child component's children runs once (control)", () => {
    const js = clientJsOf('<Chip><input ref={el => register("x", el)} /></Chip>')
    expect(js).toContain(`if (_s0) (el => register("x", el))?.(_s0)`)
  })

  test('a ref on the row component element itself is passed as a prop (control)', () => {
    const js = clientJsOf('{rows().map(o => (<Chip key={o.id} ref={el => register(o.id, el)}><b>x</b></Chip>))}')
    expect(js).toContain('get ref() { return el => register(o().id, el) }')
    expect(js).not.toContain('__rf_')
  })
})
