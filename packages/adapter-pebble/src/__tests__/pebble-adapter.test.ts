import { describe, expect, test } from 'bun:test'
import { PebbleAdapter, pebbleAdapter } from '../adapter/index.ts'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'

/**
 * Phase 2 smoke tests (#2101 adapter core). The render methods now emit real
 * `.peb` template text — these tests exercise the main render paths
 * end-to-end through the real compiler pipeline (`compileJSX`) rather than
 * hand-built IR, the same pattern the Jinja/Twig adapters' unit tests use.
 *
 * This is NOT the conformance suite (`runAdapterConformanceTests` against the
 * ~190 shared fixtures) — that is Phase 4, wired up once the Java runtime
 * (Phase 3) exists to actually execute the emitted templates. These tests
 * only assert the TEMPLATE TEXT SHAPE compiles without throwing and contains
 * the syntax markers this file's `pebble-adapter.ts` documents (`{% elseif
 * %}`, `bf.truthy`, `bf.string`, the symbolic ternary, `bf.eq`/`bf.neq`,
 * `bf.merge`, the `{% set %}...{% endset %}` children-capture shape, …).
 */

function compileToIR(source: string): ComponentIR {
  const result = compileJSX(source.trimStart(), 'test.tsx', {
    adapter: new PebbleAdapter(),
    outputIR: true,
  })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('No IR output')
  return JSON.parse(irFile.content) as ComponentIR
}

function compileAndGenerate(source: string) {
  return new PebbleAdapter().generate(compileToIR(source))
}

describe('PebbleAdapter', () => {
  test('declares its name and extension', () => {
    expect(pebbleAdapter.name).toBe('pebble')
    expect(pebbleAdapter.extension).toBe('.peb')
    expect(pebbleAdapter.templatesPerComponent).toBe(true)
  })

  test('renders a static element with a text expression', () => {
    const { template } = compileAndGenerate(`
export function Greeting({ name }: { name: string }) {
  return <div class="greeting">Hello, {name}!</div>
}
`)
    expect(template).toContain('class="greeting"')
    expect(template).toContain('bf.string(')
  })

  test('renders a conditional as {% if %}/{% else %}/{% endif %}', () => {
    const { template } = compileAndGenerate(`
export function Toggle({ on }: { on: boolean }) {
  return <div>{on ? <span>On</span> : <span>Off</span>}</div>
}
`)
    expect(template).toContain('{% if ')
    expect(template).toContain('{% else %}')
    expect(template).toContain('{% endif %}')
  })

  test('renders an early-return if-statement chain with {% elseif %}, not Jinja-style {% elif %}', () => {
    const { template } = compileAndGenerate(`
export function Status({ code }: { code: number }) {
  if (code === 200) return <span>OK</span>
  if (code === 404) return <span>Not Found</span>
  return <span>Error</span>
}
`)
    expect(template).toContain('{% if ')
    expect(template).toContain('{% elseif ')
    expect(template).not.toContain('{% elif ')
    // `===` never routes through a native Pebble equality operator.
    expect(template).toContain('bf.eq(')
  })

  test('renders a .map() loop with the loop:/…/loop: marker pair and loop.index', () => {
    const { template } = compileAndGenerate(`
export function List({ items }: { items: string[] }) {
  return <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
}
`)
    expect(template).toContain('{% for ')
    expect(template).toContain('{% endfor %}')
    expect(template).toContain('bf.comment("loop:')
    expect(template).toContain('bf.comment("/loop:')
    // Pebble's own 0-based `loop.index` — never `loop.index0`.
    expect(template).toContain('loop.index')
    expect(template).not.toContain('loop.index0')
  })

  test('renders a child component invocation via bf.render_child with a map literal', () => {
    const { template } = compileAndGenerate(`
export function Parent() {
  return <div><Child label="hi" /></div>
}
function Child({ label }: { label: string }) {
  return <span>{label}</span>
}
`)
    expect(template).toContain("bf.render_child('child'")
    expect(template).toContain('| raw')
  })

  test('forwards JSX children via a {% set %}...{% endset %} capture', () => {
    const { template } = compileAndGenerate(`
export function Parent() {
  return <Box><span>inside</span></Box>
}
function Box({ children }: { children: unknown }) {
  return <div class="box">{children}</div>
}
`)
    expect(template).toMatch(/\{% set bf_children_\w+ %\}/)
    expect(template).toContain('{% endset %}')
    expect(template).toContain("'children':")
  })

  test('renders JS `+` on a string-typed operand as `~`, not native `+`', () => {
    const { template } = compileAndGenerate(`
export function Greeting({ first, last }: { first: string; last: string }) {
  return <span>{first + ' ' + last}</span>
}
`)
    expect(template).toContain('~')
  })

  test('renders nullish-coalescing as the native `??` operator', () => {
    const { template } = compileAndGenerate(`
export function Label({ label }: { label?: string }) {
  return <span>{label ?? 'default'}</span>
}
`)
    expect(template).toContain('??')
  })
})
