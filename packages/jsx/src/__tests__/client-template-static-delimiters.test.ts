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

test('nested JSX prop keys and props remain literal data in init and CSR', () => {
  const result = compileJSX(propFixture.source, `${propFixture.id}.tsx`, { adapter: new TestAdapter() })
  expect(result.errors.filter(error => error.severity === 'error')).toEqual([])
  const calls: { name: string; label: unknown; key: unknown }[] = []
  const templates = new Map<string, (props: object) => string>()
  const exports: Record<string, (...args: unknown[]) => unknown> = {}
  const runtime = {
    hydrate(name: string, component: { template: (props: object) => string }) { templates.set(name, component.template) },
    ownScopeId() { return 'root' },
    $c() { return [{}] },
    __slot(render: () => string) { return render() },
    initChild(_name: string, _scope: unknown, props: { header?: string }) { void props.header },
    renderChild(name: string, props: { label?: string }, key: unknown) {
      calls.push({ name, label: props.label, key })
      return '<em>badge</em>'
    },
    bfMarkup(value: string) { return value },
  }
  for (const file of result.files.filter(file => file.type === 'clientJs')) {
    const output = ts.transpileModule(file.content, {
      compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.CommonJS },
    }).outputText
    new Function('require', 'exports', output)(() => runtime, exports)
  }
  exports.initJsxPropTemplateDelimiters({})
  templates.get('JsxPropTemplateDelimiters')!({})
  expect(calls.filter(call => call.name === 'TemplateDelimiterBadge')).toEqual([
    { name: 'TemplateDelimiterBadge', label: '` \\ ${notCode}', key: '` \\ ${notCode}' },
    { name: 'TemplateDelimiterBadge', label: '` \\ ${notCode}', key: '` \\ ${notCode}' },
  ])
})
