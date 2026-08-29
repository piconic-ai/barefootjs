/**
 * Render-root row-key relay, across both adapter families (#2753).
 *
 * `IRElement.keyAttr` with no `value` means "this element is one of THIS
 * component's rendered roots; relay whatever key the caller supplies at
 * runtime". Every SSR adapter must emit that relay on the SAME element it
 * puts `bf-s` on — the client runtime reconciles keyed rows by reading the
 * key attribute off the row's primary element, and it splices `data-key`
 * onto the rendered markup's first element on the CSR side.
 *
 * The shape this guards is a component whose root is a `<Ctx.Provider>`
 * (select, popover, accordion, carousel, combobox, command, dropdown-menu,
 * radio-group all have it). The provider is not itself an element, so a
 * resolver that walks down from the IR root and stops at the first
 * non-element node never reaches the `bf-s` element underneath it and every
 * adapter silently drops the relay. Asserting on the emitted TEMPLATE, not
 * on rendered HTML, is deliberate: a standalone render passes no key, so the
 * relay is invisible in `expectedHtml` and no HTML fixture can see this.
 *
 * Hono (the reference adapter) plus three DSL adapters — the two families
 * that disagreed — is the coverage this needs; every remaining DSL adapter
 * emits from the same `element.keyAttr` branch.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { GoTemplateAdapter } from '@barefootjs/go-template/adapter'
import { MojoAdapter } from '@barefootjs/mojolicious/adapter'
import { XslateAdapter } from '@barefootjs/xslate/adapter'
import type { TemplateAdapter } from '@barefootjs/jsx'

const PROVIDER_ROOT = `
'use client'
import { createContext, createSignal } from '@barefootjs/client'

const SelectContext = createContext({ open: false })

export function Select(props: { children?: unknown }) {
  const [open, setOpen] = createSignal(false)
  return (
    <SelectContext.Provider value={{ open: open(), setOpen }}>
      <div data-slot="select">{props.children}</div>
    </SelectContext.Provider>
  )
}
`

const PLAIN_ROOT = `
'use client'
import { createSignal } from '@barefootjs/client'

export function Select(props: { children?: unknown }) {
  const [open, setOpen] = createSignal(false)
  return <div data-slot="select" onClick={() => setOpen(!open())}>{props.children}</div>
}
`

/**
 * Per adapter: the relay token emitted for a valueless `keyAttr`, and the
 * token that lowers `{props.children}`. Everything between `<div ` and the
 * children token IS the opening tag — children are the first thing after
 * `>` — so "relay before children" is exactly "relay inside the tag", without
 * having to find the `>` through four different action syntaxes (`:>` and
 * `%>` both contain one).
 */
interface AdapterCase {
  name: string
  make: () => TemplateAdapter
  relay: string
  children: string
}

const ADAPTERS: readonly AdapterCase[] = [
  {
    name: 'hono',
    make: () => new HonoAdapter(),
    relay: '"data-key": __dataKey',
    children: '{props.children}',
  },
  {
    name: 'go-template',
    make: () => new GoTemplateAdapter(),
    relay: '{{if .BfDataKey}} data-key="{{.BfDataKey}}"{{end}}',
    children: '{{.Children}}',
  },
  {
    name: 'mojolicious',
    make: () => new MojoAdapter(),
    relay: 'bf->data_key_attr',
    children: '$children',
  },
  {
    name: 'xslate',
    make: () => new XslateAdapter(),
    relay: '$bf.data_key_attr()',
    children: '$children',
  },
]

function markedTemplate(source: string, adapter: TemplateAdapter): string {
  const result = compileJSX(source, 'Select.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
  const file = result.files.find(f => f.type === 'markedTemplate')
  expect(file).toBeDefined()
  return file!.content
}

describe('render-root row-key relay is emitted by every adapter family (#2753)', () => {
  for (const adapter of ADAPTERS) {
    describe(adapter.name, () => {
      test.each([
        ['provider root', PROVIDER_ROOT],
        ['plain element root', PLAIN_ROOT],
      ])('%s: the bf-s element also carries the caller-key relay', (_label, source) => {
        const template = markedTemplate(source, adapter.make())
        const divAt = template.indexOf('<div ')
        const childrenAt = template.indexOf(adapter.children, divAt)
        const scopeAt = template.indexOf('bf-s', divAt)
        const relayAt = template.indexOf(adapter.relay, divAt)
        expect({ divAt: divAt >= 0, childrenAt: childrenAt >= 0 }).toEqual({ divAt: true, childrenAt: true })
        // Both markers inside the same opening tag.
        expect(scopeAt).toBeGreaterThan(divAt)
        expect(scopeAt).toBeLessThan(childrenAt)
        expect(relayAt).toBeGreaterThan(divAt)
        expect(relayAt).toBeLessThan(childrenAt)
      })
    })
  }
})
