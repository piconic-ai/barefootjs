/**
 * html/template strips a leading `data-` before classifying an attribute, so
 * a literal `data-on…="{{…}}"` is escaped as an `on…` event-handler (script)
 * attribute and the value renders as a quoted JS string (#3309), and
 * `data-src` / `data-url` / `data-href` are escaped as URLs (#3326). Such
 * names are emitted through the `bf_attr_name` action, which html/template
 * does not classify; every other name stays literal text — including a real
 * handler / URL attribute (`onclick`, `href`), which must keep html/template's
 * contextual escaping.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'
import { isGoNonPlainDataAttrName, goAttrNameToken } from '../adapter/lib/go-emit'

function generate(src: string) {
  const adapter = new GoTemplateAdapter()
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter, outputIR: true })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('no IR')
  const ir = JSON.parse(irFile.content) as ComponentIR
  return adapter.generate(ir)
}

describe('isGoNonPlainDataAttrName', () => {
  test('matches data-… names html/template escapes as script, URL, CSS or srcset', () => {
    for (const n of [
      // script (#3309)
      'data-on', 'data-onset', 'DATA-ONSET',
      // URL: attrTypeMap entries and the src / uri / url heuristic (#3326)
      'data-src', 'data-url', 'data-uri', 'data-image-url', 'data-urls', 'data-thumbsrc', 'DATA-SRC',
      'data-href', 'data-action', 'data-data', 'data-icon', 'data-poster', 'data-cite', 'data-xmlns',
      // CSS / srcset
      'data-style', 'data-srcset',
    ]) {
      expect(isGoNonPlainDataAttrName(n)).toBe(true)
    }
  })

  test('never a real attribute, and not a data-… name html/template already treats as plain', () => {
    for (const n of [
      'onclick', 'ONCLICK', 'onerror', 'xlink:onclick', 'href', 'src', 'style', 'srcset', 'title',
      'data-state', 'data-key', 'data-value', 'data-type', 'data-content', 'data-rel', 'data-srcdoc',
      'data-n-on', 'data-label',
    ]) {
      expect(isGoNonPlainDataAttrName(n)).toBe(false)
    }
  })

  test('goAttrNameToken wraps only such a data-… name', () => {
    expect(goAttrNameToken('data-on')).toBe('{{bf_attr_name "data-on"}}')
    expect(goAttrNameToken('data-src')).toBe('{{bf_attr_name "data-src"}}')
    expect(goAttrNameToken('data-state')).toBe('data-state')
    expect(goAttrNameToken('onclick')).toBe('onclick')
    expect(goAttrNameToken('href')).toBe('href')
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
    expect(template).toContain(`${ON('data-on')}"{{if (bf_truthy .On)}}yes{{else}}no{{end}}"`)
    expect(template).toContain(`${ON('data-onset')}"{{(bf_ternary (bf_truthy .On) .Label \"no\")}}"`)
    expect(template).toContain(`${ON('data-onload')}"v-{{.Label}}"`)
    expect(template).toMatch(/\{\{if [^}]*\}\}\{\{bf_attr_name "data-ontoggle"\}\}="\{\{\.Label\}\}"\{\{end\}\}/)
    expect(template).toContain(`{{if ne .Extra nil}}${ON('data-onclear')}"{{.Extra}}"{{end}}`)
    expect(template).not.toMatch(/ data-on[a-z]*="/)
  })

  // A lowercase `onclick` is not extracted as a compiler event (only
  // `on[A-Z]` is), so it reaches the attribute emitter. Its name must stay
  // literal so html/template keeps escaping the value as JavaScript — see
  // `TestAttrName_NativeHandlerKeepsJSEscaping` for the real execution.
  test('a native handler attribute keeps its literal name', () => {
    const { template } = generate(`
export function C(props: { payload: string }) {
  return <button onclick={props.payload}>click</button>
}
`)
    expect(template).toContain('onclick="{{.Payload}}"')
    expect(template).not.toContain('bf_attr_name')
  })
})

describe('URL / CSS-classified data-… attribute names route through bf_attr_name (#3326)', () => {
  test('signal, prop, ternary and template-literal values', () => {
    const { template } = generate(`
'use client'
import { createSignal } from '@barefootjs/client'
export function C(props: { url: string }) {
  const [v] = createSignal('a b')
  const [on] = createSignal(true)
  return (
    <a
      href={props.url}
      data-src={v()}
      data-url={props.url}
      data-image-url={on() ? v() : 'none'}
      data-href={\`/p/\${props.url}\`}
      data-style={v()}
      data-state={v()}
    >x</a>
  )
}
`)
    const AN = (n: string) => `{{bf_attr_name "${n}"}}=`
    expect(template).toContain(`${AN('data-src')}"{{.V}}"`)
    expect(template).toContain(`${AN('data-url')}"{{.URL}}"`)
    expect(template).toContain(`${AN('data-href')}"/p/{{.URL}}"`)
    expect(template).toContain(`${AN('data-style')}"{{.V}}"`)
    expect(template).toContain(AN('data-image-url'))
    expect(template).toContain('data-state="{{.V}}"')
    // A real URL attribute keeps its literal name, so its value stays URL-escaped.
    expect(template).toContain('href="{{.URL}}"')
  })
})
