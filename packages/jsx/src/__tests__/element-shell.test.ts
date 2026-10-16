import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import type { CompilerError, IRElement, IRNode } from '../types'
import type { AttrValueEmitter } from '../adapters/attr-value-emitter'
import { renderElementShell, renderFragmentScope, type ElementShellSpelling } from '../adapters/element-shell'
import { renderDangerousInnerHtml } from '../adapters/dangerous-inner-html'

// #3475: the element every template adapter writes the same way, with the
// adapter's spelling supplied as data.
function root(source: string): IRNode {
  const ir = jsxToIR(analyzeComponent(source, 'Test.tsx'))
  if (!ir) throw new Error('expected IR')
  return ir
}

const attrEmitter: AttrValueEmitter = {
  emitLiteral: (value, name) => `${name}="${value.value}"`,
  emitExpression: (value, name) => `${name}="<${value.expr}>"`,
  emitBooleanAttr: (_value, name) => name,
  emitBooleanShorthand: (_value, name) => name,
  emitTemplate: (_value, name) => `${name}="<tpl>"`,
  emitSpread: () => '',
  emitJsxChildren: () => '',
}

function spelling(errors: CompilerError[] = []): ElementShellSpelling {
  return {
    attrEmitter,
    renderDangerousInnerHtml: element =>
      renderDangerousInnerHtml(element, errors, 'jinja', expr => `[raw ${expr}]`),
    renderChildren: (children) => children.map(c => (c.type === 'text' ? c.value : `{${c.type}}`)).join(''),
    renderScopeMarker: () => 'bf-s="SCOPE"',
    renderSlotMarker: slotId => `bf="${slotId}"`,
    dataKeyRelay: 'RELAY',
    scopeIdValue: 'SCOPE_ID',
    wrapSsrPortalElement: rendered => `[portal ${rendered}]`,
  }
}

describe('renderElementShell (#3475)', () => {
  test('renders attributes, the root markers, children, and the close tag', () => {
    // A render root relays its caller's row key, in the adapter's spelling.
    const el = root(`function Test() { return <p className="a" id="x">hi</p> }\nexport { Test }`) as IRElement
    expect(renderElementShell(el, spelling())).toBe('<p class="a" id="x" bf-s="SCOPE" RELAY>hi</p>')
  })

  test('a void element has no children or close tag', () => {
    const el = root(`function Test() { return <input type="text" /> }\nexport { Test }`) as IRElement
    expect(renderElementShell(el, spelling())).toBe('<input type="text" bf-s="SCOPE" RELAY>')
  })

  test('a dynamic dangerouslySetInnerHTML replaces the children through the raw sink', () => {
    const el = root(
      `function Test({ html }: { html: string }) { return <div dangerouslySetInnerHTML={{ __html: html }}>x</div> }\nexport { Test }`,
    ) as IRElement
    expect(renderElementShell(el, spelling())).toContain('>[raw html]</div>')
  })

  test('an unlowerable dangerouslySetInnerHTML records BF101 and renders empty', () => {
    const el = root(
      `function Test({ v }: { v: { __html: string } }) { return <div dangerouslySetInnerHTML={v} /> }\nexport { Test }`,
    ) as IRElement
    const errors: CompilerError[] = []
    expect(renderElementShell(el, spelling(errors))).toMatch(/><\/div>$/)
    expect(errors.map(e => e.code)).toEqual(['BF101'])
  })
})

describe('renderFragmentScope (#3475)', () => {
  test('wraps a component-root fragment in its scope comment, else returns the children', () => {
    const fragment = { type: 'fragment', children: [], needsScopeComment: true } as never
    const render = () => 'kids'
    expect(renderFragmentScope(fragment, render, r => `<!--s-->${r}<!--/s-->`)).toBe('<!--s-->kids<!--/s-->')
    const plain = { type: 'fragment', children: [], needsScopeComment: false } as never
    expect(renderFragmentScope(plain, render, r => `<!--s-->${r}<!--/s-->`)).toBe('kids')
  })
})
