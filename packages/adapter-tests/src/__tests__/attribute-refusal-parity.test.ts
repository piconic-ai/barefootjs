import { describe, expect, test } from 'bun:test'
import { compileFixtureJSX } from '../harness-program'
import { DSL_ADAPTERS } from '../dsl-helper-calls'

const preamble = `
function cn(parts: TemplateStringsArray): string { return parts.join('-') }
`

for (const adapter of DSL_ADAPTERS) {
  describe(`${adapter.name}: attribute refusals use the parsed-expression gate`, () => {
    for (const expression of [
      '{ a: 1 }',
      '(({ a: 1 }))',
      'cn`base`',
      '(cn`base`)',
      'cn /* between tag and template */ `base`',
      'flag ? cn`base` : "plain"',
      '"prefix" + cn`base`',
    ]) {
      test(`refuses ${expression}`, () => {
        const source = `${preamble}\nexport function Demo({ flag }: { flag: boolean }) { return <div title={${expression}}>x</div> }`
        const result = compileFixtureJSX(source, 'Demo.tsx', { adapter: adapter.make() })
        expect(result.errors.filter(error => error.code === 'BF101')).toHaveLength(1)
      })
    }
    test('refuses a tagged template used as a spread', () => {
      const source = `${preamble}\nexport function Demo() { return <div {...cn\`base\`}>x</div> }`
      const result = compileFixtureJSX(source, 'Demo.tsx', { adapter: adapter.make() })
      expect(result.errors.filter(error => error.code === 'BF101')).toHaveLength(1)
    })
    for (const expression of ['"literal cn` text"', '`plain ${label}`', 'flag ? "on" : "off"']) {
      test(`accepts ${expression}`, () => {
        const source = `export function Demo({ flag, label }: { flag: boolean; label: string }) { return <div title={${expression}}>x</div> }`
        const result = compileFixtureJSX(source, 'Demo.tsx', { adapter: adapter.make() })
        expect(result.errors.filter(error => error.severity === 'error')).toEqual([])
      })
    }
  })
}
