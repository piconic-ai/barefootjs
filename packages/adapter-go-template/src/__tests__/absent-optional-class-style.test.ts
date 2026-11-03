/**
 * #3859: an optional primitive prop bound whole to `class` / `className` /
 * `style` takes the same `interface{}` flip and `ne … nil` guard as any other
 * attribute, so an absent prop omits the attribute. The `style` string case
 * is pinned here rather than in a shared fixture: a generated markup value
 * hits html/template's CSS escaper (`ZgotmplZ`), a separate divergence.
 * A non-primitive `style` prop and a `style={{ … }}` literal keep their own
 * lowerings.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

const compile = (source: string) => {
  const result = compileJSX(source.trimStart(), 'test.tsx', { adapter: new GoTemplateAdapter(), outputIR: false })
  const types = result.files.find(f => f.type === 'types')?.content ?? ''
  const template = result.files.find(f => f.type === 'markedTemplate')?.content ?? ''
  return { types, template, errors: result.errors }
}

describe('GoTemplateAdapter - absent optional prop on class / className / style (#3859)', () => {
  test('a string style prop is nil-guarded', () => {
    const { types, template, errors } = compile(`
export function S(props: { css?: string }) {
  return <em style={props.css}>c</em>
}
`)
    expect(errors).toEqual([])
    expect(types).toContain('CSS interface{}')
    expect(template).toContain('{{if ne .CSS nil}}style="{{.CSS}}"{{end}}')
  })

  test('className and class props are nil-guarded', () => {
    const { types, template } = compile(`
export function C({ tone, hue }: { tone?: string; hue?: string }) {
  return <div className={tone}><span class={hue}>h</span></div>
}
`)
    expect(types).toContain('Tone interface{}')
    expect(types).toContain('Hue interface{}')
    expect(template).toContain('{{if ne .Tone nil}}class="{{.Tone}}"{{end}}')
    expect(template).toContain('{{if ne .Hue nil}}class="{{.Hue}}"{{end}}')
  })

  test('a style object literal keeps its bf_style_object lowering', () => {
    const { template } = compile(`
export function O({ color }: { color?: string }) {
  return <em style={{ color }}>c</em>
}
`)
    expect(template).toContain('style="{{bf_style_object "color"')
    expect(template).not.toContain('{{if ne .Color nil}}style=')
  })

  test('a required prop on class is not flipped', () => {
    const { types, template } = compile(`
export function R({ tone }: { tone: string }) {
  return <p class={tone}>x</p>
}
`)
    expect(types).toContain('Tone string')
    expect(template).toContain('class="{{.Tone}}"')
    expect(template).not.toContain('ne .Tone nil')
  })
})
