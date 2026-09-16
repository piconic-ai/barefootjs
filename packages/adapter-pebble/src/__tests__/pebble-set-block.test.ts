import { describe, expect, test } from 'bun:test'
import { isJavaToolchainAvailable, renderPebbleTemplate } from '../test-render.ts'

/**
 * Phase 3b end-to-end smoke tests (#2101): the custom `{% set NAME %}...
 * {% endset %}` block-capture tag (`java/src/main/java/dev/barefootjs/
 * pebble/ext/`), driven through the REAL `java -jar` CLI path — not just the
 * Java-side `SetBlockExtensionTest` JUnit tests, which exercise the engine
 * directly. Covers exactly the two shapes `pebble-adapter.ts` emits: the
 * async-fallback form (`bf.async_boundary(id, CAPTURED)`) and the
 * JSX-children/named-slot forwarding form (a captured var referenced by
 * name inside a helper-call argument), plus nesting.
 *
 * Cross-template child rendering (`bf.render_child`) is still unimplemented
 * (needs multi-template dispatch in `Main`/`Bf`, a separate follow-up — see
 * `Bf.render_child`'s own doc comment) — not exercised here.
 */
describe('Pebble Java runtime (Phase 3b {% set %}...{% endset %} smoke tests)', () => {
  test.skipIf(!isJavaToolchainAvailable())('block-capture binds a plain string variable', async () => {
    const template = `{% set greeting %}Hello, {{ bf.string(name) | raw }}!{% endset %}<p>{{ greeting | raw }}</p>`
    const html = await renderPebbleTemplate({ template, vars: { name: 'World' } })
    expect(html).toBe('<p>Hello, World!</p>')
  })

  test.skipIf(!isJavaToolchainAvailable())('async-fallback forwarding shape', async () => {
    const template = `{% set fallback %}<span>Loading...</span>{% endset %}{{ bf.async_boundary('boundary-1', fallback) | raw }}`
    const html = await renderPebbleTemplate({ template, vars: {} })
    expect(html).toBe('<div bf-async="boundary-1"><span>Loading...</span></div>')
  })

  test.skipIf(!isJavaToolchainAvailable())('nested block-capture (a named slot inside JSX children)', async () => {
    const template = `{% set outer %}<div>{% set inner %}<em>{{ bf.string(label) | raw }}</em>{% endset %}{{ inner | raw }}</div>{% endset %}{{ outer | raw }}`
    const html = await renderPebbleTemplate({ template, vars: { label: 'tag' } })
    expect(html).toBe('<div><em>tag</em></div>')
  })

  test.skipIf(!isJavaToolchainAvailable())('the plain assignment form still works alongside the block form', async () => {
    const template = `{% set n = 1 + 2 %}{% set label %}total={{ bf.string(n) | raw }}{% endset %}{{ label | raw }}`
    const html = await renderPebbleTemplate({ template, vars: {} })
    expect(html).toBe('total=3')
  })
})
