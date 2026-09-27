/**
 * `createMutation` recognition (#3210): the value is collected as a signal
 * seeded `undefined` (a mutation has no `initial`, spec/async.md §7.4), the
 * request function is emitted into the client JS only and never wrapped in
 * anything that tracks, and the action's `isPending()` / `error()` seed
 * through the same gate as a query's (`action-accessor.ts`, #3166).
 * Cross-adapter output lives in the `create-mutation-*` conformance fixtures;
 * this file pins the compiler-internal decisions.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'
import { GoTemplateAdapter } from '../../../adapter-go-template/src/index'
import { extractInitBody, extractTemplateBody } from './staged-ir/helpers'

function compile(source: string, options: { adapter?: 'test' | 'hono' | 'go' } = {}) {
  const adapter =
    options.adapter === 'hono' ? new HonoAdapter() : options.adapter === 'go' ? new GoTemplateAdapter() : new TestAdapter()
  const result = compileJSX(source, 'Component.tsx', { adapter })
  const clientJs = result.files.find((f) => f.type === 'clientJs')?.content ?? ''
  const ssr = result.files.find((f) => f.type === 'markedTemplate')?.content ?? ''
  return {
    codes: result.errors.map((e) => e.code),
    errors: result.errors,
    clientJs,
    initBody: extractInitBody(clientJs),
    templateBody: extractTemplateBody(clientJs),
    ssr,
  }
}

const FORM = `
'use client'
import { createMutation, createSignal, http } from '@barefootjs/client'
export function CommentForm(props: { postId: number }) {
  const [text, setText] = createSignal('')
  const [saved, save] = createMutation(() => http.post('/api/posts/' + props.postId + '/comments', { body: { text: text() } }), { invalidates: ['/api/posts'] })
  return (
    <form>
      {save.error() ? <p>Failed</p> : null}
      {saved() ? <p>Saved</p> : null}
      <input value={text()} onInput={(e) => setText(e.target.value)} />
      <button disabled={save.isPending()} onClick={() => save()}>Send</button>
    </form>
  )
}
`

describe('createMutation value and client JS (#3210)', () => {
  test('emits the factory call verbatim with props read live and `invalidates` unchanged', () => {
    const { codes, initBody } = compile(FORM)
    expect(codes).toEqual([])
    expect(initBody).toContain(
      "const [saved, save] = createMutation(() => http.post('/api/posts/' + _p.postId + '/comments', { body: { text: text() } }), { invalidates: ['/api/posts'] })",
    )
  })

  test('the request function is not wrapped in anything that tracks', () => {
    const { initBody } = compile(FORM)
    // The only occurrence of the request is the factory call's own argument:
    // no effect, memo or signal initializer re-emits it.
    expect(initBody.split("http.post('/api/posts/'").length - 1).toBe(1)
    const effectBodies = initBody.split('createEffect(').slice(1)
    for (const body of effectBodies) expect(body.split('\n')[0]).not.toContain('http.post')
    expect(initBody).not.toContain('createSignal(undefined)')
  })

  test('the CSR template seeds the value undefined and never reads the request function', () => {
    const { templateBody } = compile(FORM)
    expect(templateBody).not.toContain('http.post')
    expect(templateBody).toContain('${undefined ?')
  })

  test('Hono SSR seeds the value undefined, stubs the action, and never emits the request function', () => {
    const { codes, ssr } = compile(FORM, { adapter: 'hono' })
    expect(codes).toEqual([])
    expect(ssr).toContain('const saved = () => undefined')
    expect(ssr).toContain('const save: any = Object.assign(() => {}, { isPending: () => false, error: () => undefined })')
    expect(ssr).not.toContain('http.post')
    // A prop read only by the request function still reaches the client.
    expect(ssr).toContain("__hydrateProps['postId'] = props.postId")
  })

  test('the value-elided form keeps just the action', () => {
    const { codes, initBody } = compile(`
'use client'
import { createMutation, http } from '@barefootjs/client'
export function C() {
  const [, send] = createMutation(() => http.post('/api/ping'))
  return <button onClick={() => send()}>ping</button>
}
`)
    expect(codes).toEqual([])
    expect(initBody).toContain("const [, send] = createMutation(() => http.post('/api/ping'))")
  })
})

describe('createMutation action accessors (#3210, via #3166)', () => {
  test('disabled={save.isPending()} and an error condition are seeded in DSL output', () => {
    const { codes, ssr } = compile(FORM, { adapter: 'go' })
    expect(codes).toEqual([])
    expect(ssr).not.toContain('IsPending')
    expect(ssr).not.toContain('.Save.')
    expect(ssr).toContain('<button {{if false}}disabled{{end}}')
    expect(ssr).toContain('{{if false}}<p bf-c="s0">Failed</p>')
  })

  test('a read the gate does not admit still refuses with BF117', () => {
    for (const markup of ['<p>{save.error()}</p>', '<p title={save.isPending()}>x</p>', '<button disabled={save.error()}>x</button>']) {
      const { codes } = compile(`
'use client'
import { createMutation, http } from '@barefootjs/client'
export function C() {
  const [, save] = createMutation(() => http.post('/api/ping'))
  return <div>${markup}</div>
}
`)
      expect(codes).toContain('BF117')
    }
  })
})

describe('createMutation arity (BF115 / BF116)', () => {
  test('a two-argument call and a two-element destructure are accepted', () => {
    expect(compile(FORM).codes).toEqual([])
  })

  test('a three-element destructure is BF115', () => {
    const { codes } = compile(`
'use client'
import { createMutation, http } from '@barefootjs/client'
export function C() {
  const [a, b, c] = createMutation(() => http.post('/api/items'))
  return <p>{a() ? 'y' : 'n'}</p>
}
`)
    expect(codes).toContain('BF115')
  })

  test('a third argument is BF116', () => {
    const { codes } = compile(`
'use client'
import { createMutation, http } from '@barefootjs/client'
export function C() {
  const [a] = createMutation(() => http.post('/api/items'), {}, 'extra')
  return <p>{a() ? 'y' : 'n'}</p>
}
`)
    expect(codes).toContain('BF116')
  })
})

describe('createMutation `initial` is refused (BF118)', () => {
  const withOptions = (options: string, params = '') => `
'use client'
import { createMutation, http } from '@barefootjs/client'
export function C(${params}) {
  const [saved, save] = createMutation(() => http.post('/api/items'), ${options})
  return <button onClick={() => save()}>{saved() ? 'saved' : 'save'}</button>
}
`

  test('an `initial` key names createQuery as the factory that takes it', () => {
    const { codes, errors } = compile(withOptions("{ initial: 'x', invalidates: ['/api'] }"))
    expect(codes).toEqual(['BF118'])
    expect(errors[0].message).toContain("Use 'createQuery'")
  })

  test('a shorthand `initial` is refused too', () => {
    const { codes } = compile(withOptions('{ initial }', '{ initial }: { initial?: string }'))
    expect(codes).toEqual(['BF118'])
  })

  test('options without `initial`, or that cannot be read structurally, are accepted', () => {
    expect(compile(withOptions("{ invalidates: ['/api'] }")).codes).toEqual([])
    expect(compile(withOptions('{ ...props.opts }', 'props: { opts: {} }')).codes).toEqual([])
  })

  test('the refused `initial` never seeds the value', () => {
    const { ssr } = compile(withOptions("{ initial: 'x' }"), { adapter: 'hono' })
    expect(ssr).toContain('const saved = () => undefined')
  })
})
