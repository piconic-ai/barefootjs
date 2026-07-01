/**
 * Registry → adapter end-to-end (#2057). Every lowering — first-party built-ins
 * (like `queryHref`) and userland plugins alike — flows through the one
 * lowering-plugin *registry*. This test guarantees that seam works all the way
 * through: a SAMPLE plugin (registered via the public `registerLoweringPlugin`)
 * recognises a call from an arbitrary package and returns a backend-neutral
 * `guard-list` node, and the Go adapter renders it via its own `bf_query`
 * mapping — no adapter code knows the sample plugin exists.
 *
 * The plugin reuses the `'query'` helper id so it exercises the exact same
 * renderer path as the built-in `queryHref` plugin, proving that a userland
 * plugin and a default-registered built-in are indistinguishable to the adapter
 * (which is the whole point of the neutral-node layer).
 */
import { describe, test, expect, afterEach } from 'bun:test'
import {
  compileJSX,
  registerLoweringPlugin,
  getLoweringPlugins,
  __resetLoweringPluginsForTest,
  type ComponentIR,
  type LoweringPlugin,
} from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

function generate(src: string) {
  const adapter = new GoTemplateAdapter()
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter, outputIR: true })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('no IR')
  const ir = JSON.parse(irFile.content) as ComponentIR
  return adapter.generate(ir)
}

// A userland-style plugin: active only when the component imports `demoUrl` from
// `@sample/pkg`, lowering `demoUrl(base, { key: value })` to a neutral
// `guard-list` on the `'query'` helper. It reuses the sub-parts of the parsed
// call directly (base = first arg, one triple per object property) so no
// adapter syntax leaks into the plugin.
const samplePlugin: LoweringPlugin = {
  name: 'sample-demo-url',
  prepare(metadata) {
    const spec = metadata.imports
      .filter(i => i.source === '@sample/pkg' && !i.isTypeOnly)
      .flatMap(i => i.specifiers)
      .filter(s => !s.isTypeOnly && !s.isNamespace && !s.isDefault)
      .find(s => s.name === 'demoUrl')
    if (!spec) return null
    const local = spec.alias ?? spec.name // the name it's bound under in this file
    return (callee, args) => {
      if (callee.kind !== 'identifier' || callee.name !== local) return null
      const [base, obj] = args
      if (!base || obj?.kind !== 'object-literal') return null
      return {
        kind: 'guard-list',
        helper: 'query',
        base,
        triples: obj.properties.map(p => ({ guard: null, key: p.key, value: p.value })),
      }
    }
  },
}

afterEach(() => {
  __resetLoweringPluginsForTest(getLoweringPlugins().filter(p => p.name !== 'sample-demo-url'))
})

describe('lowering-plugin registry → Go adapter (#2057)', () => {
  test('a registered plugin lowers its call to the neutral node the adapter renders', () => {
    registerLoweringPlugin(samplePlugin)
    const src = `
'use client'
import { demoUrl } from '@sample/pkg'
export function P(props: { base: string; tag: string }) {
  return <a href={demoUrl(props.base, { tag: props.tag })}>x</a>
}
`
    const { template } = generate(src)
    // Same render path as built-in queryHref: guard-list → bf_query.
    expect(template).toContain('bf_query .Base (true) "tag" .Tag')
  })

  test('without the plugin registered the same call falls back to the generic lowering', () => {
    // No registerLoweringPlugin call — the registry is empty for this component.
    const src = `
'use client'
import { demoUrl } from '@sample/pkg'
export function P(props: { base: string; tag: string }) {
  return <a href={demoUrl(props.base, { tag: props.tag })}>x</a>
}
`
    const { template } = generate(src)
    expect(template).not.toContain('bf_query')
  })

  test('the plugin is inert when the component does not import from its package', () => {
    registerLoweringPlugin(samplePlugin)
    const src = `
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; tag: string }) {
  return <a href={queryHref(props.base, { tag: props.tag })}>x</a>
}
`
    const { template } = generate(src)
    // Built-in queryHref still lowers; the sample plugin simply isn't active.
    expect(template).toContain('bf_query .Base (true) "tag" .Tag')
  })
})
