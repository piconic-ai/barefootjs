/**
 * html/template strips a leading `data-` before classifying an attribute, so
 * a literal `data-on…="{{…}}"` is escaped as an `on…` event-handler (script)
 * attribute and the value renders as a quoted JS string (#3309). Such names
 * are emitted through the `bf_attr_name` action, which html/template does not
 * classify; every other name stays literal text.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'
import { isScriptContextAttrName, goAttrNameToken } from '../adapter/lib/go-emit'

function generate(src: string) {
  const adapter = new GoTemplateAdapter()
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter, outputIR: true })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('no IR')
  const ir = JSON.parse(irFile.content) as ComponentIR
  return adapter.generate(ir)
}

describe('isScriptContextAttrName', () => {
  test('matches html/template\'s script bucket after the data- / namespace strip', () => {
    for (const n of ['data-on', 'data-onset', 'DATA-ONSET', 'xlink:onclick']) {
      expect(isScriptContextAttrName(n)).toBe(true)
    }
    for (const n of ['data-state', 'data-key', 'title', 'data-data-on', 'data-n-on']) {
      expect(isScriptContextAttrName(n)).toBe(false)
    }
  })

  test('goAttrNameToken wraps only a script-classified name', () => {
    expect(goAttrNameToken('data-on')).toBe('{{bf_attr_name "data-on"}}')
    expect(goAttrNameToken('data-state')).toBe('data-state')
  })
})

const ON = (n: string) => `{{bf_attr_name "${n}"}}=`

describe('data-on… attribute names route through bf_attr_name', () => {
  test('a signal read', () => {
    const { template } = generate(`
'use client'
import { createSignal } from '@barefootjs/client'
export function C() {
  const [mode] = createSignal('x')
  return <div data-on={mode()} data-state={mode()}>x</div>
}
`)
    expect(template).toContain(`${ON('data-on')}"{{.Mode}}"`)
    expect(template).toContain('data-state="{{.Mode}}"')
  })

  test('every value shape keeps its ordinary value form behind the action name', () => {
    const { template } = generate(`
'use client'
import { createSignal } from '@barefootjs/client'
export function C(props: { label: string; extra?: string }) {
  const [on] = createSignal(true)
  return (
    <div
      data-on={on() ? 'yes' : 'no'}
      data-onset={on() ? props.label : 'no'}
      data-onload={\`v-\${props.label}\`}
      data-ontoggle={on() ? props.label : undefined}
      data-onclear={props.extra}
    >x</div>
  )
}
`)
    expect(template).toContain(`${ON('data-on')}"{{if .On}}yes{{else}}no{{end}}"`)
    expect(template).toContain(`${ON('data-onset')}"{{(bf_ternary (bf_truthy .On) .Label \"no\")}}"`)
    expect(template).toContain(`${ON('data-onload')}"v-{{.Label}}"`)
    expect(template).toMatch(/\{\{if [^}]*\}\}\{\{bf_attr_name "data-ontoggle"\}\}="\{\{\.Label\}\}"\{\{end\}\}/)
    expect(template).toContain(`{{if ne .Extra nil}}${ON('data-onclear')}"{{.Extra}}"{{end}}`)
    expect(template).not.toMatch(/ data-on[a-z]*="/)
  })
})
