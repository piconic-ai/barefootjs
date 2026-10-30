/**
 * The rest bag's Go field (`restBagField`) never takes the name of a field
 * the generated structs already have. A rest binding or a props object read
 * as a whole named `scopeID` / `bfParent` capitalizes to `ScopeID` /
 * `BfParent`, which every `<C>Input` and `<C>Props` carries; the bag then
 * becomes `ScopeID_` / `BfParent_`. Rendered on the real Go runtime, since
 * a collision only shows as a `go build` error. The rest-destructure form
 * is also pinned across adapters by `child-rest-bag-generated-field-name`.
 */
import { describe, expect, test } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'
import { GoNotAvailableError, renderGoTemplateComponent } from '../test-render'

const parent = `
import { Kid } from './kid'
export function Host() {
  return <div><Kid label="x" title="t" /></div>
}
`.trimStart()

const typesOf = (child: string): string =>
  compileJSX(child.trimStart(), 'kid.tsx', { adapter: new GoTemplateAdapter(), outputIR: false })
    .files.find(f => f.type === 'types')?.content ?? ''

const render = async (child: string): Promise<string | null> => {
  try {
    return await renderGoTemplateComponent({
      source: parent,
      adapter: new GoTemplateAdapter(),
      components: { './kid': child.trimStart() },
    })
  } catch (err) {
    if (err instanceof GoNotAvailableError) return null
    throw err
  }
}

describe('GoTemplateAdapter - rest bag field name', () => {
  for (const [label, child, field] of [
    ['a props object read as a whole named scopeID', 'export function Kid(scopeID: { label: string }) { return <b {...scopeID}>{scopeID.label}</b> }', 'ScopeID_'],
    ['a props object read as a whole named bfParent', 'export function Kid(bfParent: { label: string }) { return <b {...bfParent}>{bfParent.label}</b> }', 'BfParent_'],
    ['a rest destructure named scopeID', 'export function Kid({ label, ...scopeID }: { label: string; [k: string]: any }) { return <b {...scopeID}>{label}</b> }', 'ScopeID_'],
  ] as const) {
    test(`${label} gets a field no generated field shares`, async () => {
      const types = typesOf(child)
      expect(types).toMatch(new RegExp(`\\n\\t${field} map\\[string\\]any \`json:`))
      const html = await render(child)
      if (html === null) return
      expect(html).toContain('title="t"')
      expect(html).toContain('>x<')
    })
  }

  test('a binding that collides with nothing keeps its capitalized name', () => {
    const types = typesOf('export function Kid(props: { label: string }) { return <b {...props}>{props.label}</b> }')
    expect(types).toMatch(/\n\tProps map\[string\]any `json:/)
  })
})
