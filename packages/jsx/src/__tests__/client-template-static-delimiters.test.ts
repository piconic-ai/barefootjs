import { describe, expect, test } from 'bun:test'
import ts from 'typescript'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { fixture as staticFixture } from '../../../adapter-tests/fixtures/client-template-static-delimiters'
import { fixture as propFixture } from '../../../adapter-tests/fixtures/jsx-prop-template-delimiters'

describe('static HTML in client JS templates', () => {
  for (const fixture of [staticFixture, propFixture]) {
    test(`${fixture.id} emits valid JavaScript`, () => {
      const result = compileJSX(fixture.source, `${fixture.id}.tsx`, { adapter: new TestAdapter() })
      expect(result.errors.filter(error => error.severity === 'error')).toEqual([])
      const files = result.files.filter(file => file.type === 'clientJs')
      expect(files.length).toBeGreaterThan(0)
      for (const file of files) {
        const output = ts.transpileModule(file.content, {
          compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
          reportDiagnostics: true,
          fileName: 'client.js',
        })
        expect(output.diagnostics?.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([])
      }
    })
  }
})
