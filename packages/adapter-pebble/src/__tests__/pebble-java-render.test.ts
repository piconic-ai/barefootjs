import { describe, expect, test } from 'bun:test'
import { isJavaToolchainAvailable, renderPebbleTemplate } from '../test-render.ts'

/**
 * Phase 3a end-to-end smoke tests (#2101): hand-written `.peb` templates
 * (NOT compiled from JSX — that is Phase 4's job, once the shared
 * fixture-conformance harness is wired up) rendered through the REAL Java
 * runtime (`packages/adapter-pebble/java/`), proving the plumbing this PR
 * adds actually works: `{{ }}` interpolation, `{% if %}/{% elseif %}/
 * {% else %}/{% endif %}`, `{% for %}/{% endfor %}`, and several `bf.*`
 * helper calls (arithmetic, string, evaluator).
 *
 * Skipped gracefully when no `java` toolchain is on `PATH`, matching the
 * sibling adapters' "skip when toolchain missing" convention
 * (`isCargoAvailable`/`RustNotAvailableError` in `adapter-rust`).
 *
 * NOT exercised here: JSX-children/named-slot/async-fallback forwarding
 * (the Phase 3b `{% set %}...{% endset %}` custom tag — see
 * `pebble-set-block.test.ts`) and cross-template child rendering
 * (`bf.render_child`, still unimplemented — see `Bf.render_child`'s own
 * doc comment).
 */
describe('Pebble Java runtime (Phase 3a smoke tests)', () => {
  test.skipIf(!isJavaToolchainAvailable())('interpolation + bf.* helper calls', async () => {
    const template = `<p>{{ bf.string(bf.floor(count)) }} of {{ bf.string(total) }}</p>
<p>{{ name ~ '!' }}</p>
<p>{{ bf.eq(1, 1) }} / {{ bf.neq(1, 2) }}</p>`
    const html = await renderPebbleTemplate({
      template,
      vars: { count: 3.7, total: 10, name: 'World' },
    })
    expect(html).toContain('<p>3 of 10</p>')
    expect(html).toContain('<p>World!</p>')
    expect(html).toContain('<p>true / true</p>')
  })

  test.skipIf(!isJavaToolchainAvailable())('if / elseif / else', async () => {
    // `.length` on a Java `List` must route through `bf.length(...)` — a
    // bare `items.length` attribute access resolves to nothing (Pebble's
    // `ListResolver` only handles a NUMERIC index attribute, e.g.
    // `items.0`; a `java.util.ArrayList` has no `.length`/`getLength()`),
    // confirming why `expr/emitters.ts` already routes every `.length`
    // access through the runtime helper rather than a bare attribute.
    const template = `{% if bf.truthy(items) and bf.eq(bf.length(items), 1) %}
<p>One item</p>
{% elseif bf.length(items) > 1 %}
<p>Many items: {{ bf.string(bf.length(items)) }}</p>
{% else %}
<p>No items</p>
{% endif %}`

    const many = await renderPebbleTemplate({ template, vars: { items: ['a', 'b', 'c'] } })
    expect(many).toContain('Many items: 3')

    const one = await renderPebbleTemplate({ template, vars: { items: ['a'] } })
    expect(one).toContain('One item')

    const none = await renderPebbleTemplate({ template, vars: { items: [] } })
    expect(none).toContain('No items')
  })

  test.skipIf(!isJavaToolchainAvailable())('for / endfor with loop.index', async () => {
    const template = `<ul>{% for item in items %}<li>{{ loop.index }}: {{ bf.string(item) }}</li>{% endfor %}</ul>`
    const html = await renderPebbleTemplate({ template, vars: { items: ['a', 'b', 'c'] } })
    expect(html).toBe('<ul><li>0: a</li><li>1: b</li><li>2: c</li></ul>')
  })

  test.skipIf(!isJavaToolchainAvailable())('bf.*_eval evaluator for a .map() callback body', async () => {
    // Mirrors the exact call shape `bf.map_eval` emits (see
    // `adapter/expr/array-method.ts`'s `renderMapEval`): a serialized
    // ParsedExpr JSON string for `n => n * 2`, the arrow's single param
    // name, and a captured-free-vars env map (empty here).
    const bodyJson = JSON.stringify({
      kind: 'binary',
      op: '*',
      left: { kind: 'identifier', name: 'n' },
      right: { kind: 'literal', value: 2, literalType: 'number' },
    }).replace(/'/g, "\\'")
    const template = `{% set doubled = bf.map_eval(items, '${bodyJson}', 'n', {}) %}{{ bf.join(doubled, ',') }}`
    const html = await renderPebbleTemplate({ template, vars: { items: [1, 2, 3] } })
    expect(html.trim()).toBe('2,4,6')
  })
})
