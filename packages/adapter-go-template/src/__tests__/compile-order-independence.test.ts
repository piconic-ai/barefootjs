/**
 * A fixture's go-template output must not depend on what the process
 * compiled before it (#3637).
 *
 * `map-key-index` printed its row as `{{bf_text .}}` in one dump and `{{.}}`
 * in another, and `loop-row-scalar-member-length` once failed with `can't
 * evaluate field Length in type interface {}`. Both are the output of a
 * compile whose `@barefootjs/client` types did not resolve (an unbuilt
 * `dist`), not of state carried between compiles: the harness now refuses
 * such a compile (`harness-program-resolves-brand.test.ts`). This pins the
 * other half, that compiling with a fresh adapter gives the same template
 * and types in any order.
 *
 * The set is those two fixtures plus fixtures that declare a same-named
 * local type with different fields (`type User`), whose output changes
 * when they share ONE adapter instance. A build shares one adapter on
 * purpose: its components land in one Go package, where type and template
 * names are global. Each compile here gets its own adapter, as the
 * conformance harness does.
 */
import { describe, expect, test } from 'bun:test'
import { compileFixtureJSX } from '@barefootjs/adapter-tests/harness-program'
import type { ComponentIR } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'
import { fixture as mapKeyIndex } from '../../../adapter-tests/fixtures/map-key-index'
import { fixture as loopRowScalarMemberLength } from '../../../adapter-tests/fixtures/loop-row-scalar-member-length'
import { fixture as objectSignalFieldLength } from '../../../adapter-tests/fixtures/object-signal-field-length'
import { fixture as signalObjectField } from '../../../adapter-tests/fixtures/signal-object-field'
import { fixture as objectLiteralSignalSeedNullable } from '../../../adapter-tests/fixtures/object-literal-signal-seed-nullable'
import { fixture as nullishOptionalMemberFieldMatrix } from '../../../adapter-tests/fixtures/nullish-optional-member-field-matrix'

const FIXTURES = [
  mapKeyIndex,
  loopRowScalarMemberLength,
  objectSignalFieldLength,
  signalObjectField,
  objectLiteralSignalSeedNullable,
  nullishOptionalMemberFieldMatrix,
]
const IDS = FIXTURES.map(f => f.id)

function compileGo(id: string): string {
  const fixture = FIXTURES.find(f => f.id === id)
  if (!fixture) throw new Error(`no fixture ${id}`)
  const adapter = new GoTemplateAdapter()
  const result = compileFixtureJSX(fixture.source, 'component.tsx', { adapter, outputIR: true })
  const template = result.files.find(f => f.type === 'markedTemplate')?.content ?? ''
  const irs = result.files.filter(f => f.type === 'ir').map(f => JSON.parse(f.content) as ComponentIR)
  const types = irs.map(ir => adapter.generateTypes(ir) ?? '').join('\n')
  const errors = result.errors.map(e => `${e.code} ${e.message}`).join('\n')
  return `${template}\n${types}\n${errors}`
}

describe('go-template output is independent of compile order (#3637)', () => {
  test('each fixture compiles the same in forward order, in reverse order, and twice in a row', () => {
    const forward = new Map(IDS.map(id => [id, compileGo(id)]))
    const reverse = new Map([...IDS].reverse().map(id => [id, compileGo(id)]))
    for (const id of IDS) {
      expect(reverse.get(id)).toBe(forward.get(id))
      expect(compileGo(id)).toBe(forward.get(id))
    }
  }, 60_000)

  test('a scalar string-signal row prints bare and reads its length through bf_length', () => {
    // The two shapes the unresolved-types compile got wrong.
    expect(compileGo('map-key-index')).toContain('{{bfTextStart "s0"}}{{.}}{{bfTextEnd}}')
    const lengths = compileGo('loop-row-scalar-member-length')
    expect(lengths).toContain('{{range $_, $t := .Tags}}<li data-len="{{bf_length .}}"')
    expect(lengths).not.toContain('.Length}}')
  }, 30_000)
})
