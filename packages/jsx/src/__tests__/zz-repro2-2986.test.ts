import { describe, test } from 'bun:test'
import { compileJSX } from '../index'
import { HonoAdapter } from '../../../adapter-hono/src/adapter'

function dump(label: string, src: string) {
  const r = compileJSX(src, 'Repro.tsx', { adapter: new HonoAdapter() })
  console.log(`\n\n=========== ${label} ===========`)
  if (r.errors.length) console.log('ERR: ' + JSON.stringify(r.errors))
  for (const f of r.files) {
    if (f.type === 'ssrDefaults') continue
    console.log(`--- ${f.type} ---`)
    console.log(f.content)
  }
}

describe('matrix', () => {
  test('A sync arrow const BLOCK body with inner const', () => dump('A: sync arrow block body', `'use client'
import { createSignal } from '@barefootjs/client'
const score = (title: string, term: string): number => {
  const t = title.toLowerCase()
  return t.includes(term) ? 1 : 0
}
export function Search() {
  const [term, setTerm] = createSignal('')
  return <div onClick={() => setTerm('x')}>{score('hello', term())}</div>
}
`))

  test('B sync FUNCTION decl block body with inner const (control)', () => dump('B: sync function block body', `'use client'
import { createSignal } from '@barefootjs/client'
function score(title: string, term: string): number {
  const t = title.toLowerCase()
  return t.includes(term) ? 1 : 0
}
export function Search() {
  const [term, setTerm] = createSignal('')
  return <div onClick={() => setTerm('x')}>{score('hello', term())}</div>
}
`))

  test('C arrow const helper used in JSX .map()', () => dump('C: arrow helper in map', `'use client'
import { createSignal } from '@barefootjs/client'
type Doc = { title: string }
const score = (doc: Doc, term: string): number => (doc.title.includes(term) ? 1 : 0)
export function Search() {
  const [term, setTerm] = createSignal('')
  const [docs, setDocs] = createSignal<Doc[]>([{ title: 'hello' }])
  return <ul onClick={() => setTerm('x')}>{docs().map((doc) => <li key={doc.title}>{score(doc, term())}</li>)}</ul>
}
`))

  test('D function decl helper used in JSX .map() (control)', () => dump('D: function helper in map', `'use client'
import { createSignal } from '@barefootjs/client'
type Doc = { title: string }
function score(doc: Doc, term: string): number { return doc.title.includes(term) ? 1 : 0 }
export function Search() {
  const [term, setTerm] = createSignal('')
  const [docs, setDocs] = createSignal<Doc[]>([{ title: 'hello' }])
  return <ul onClick={() => setTerm('x')}>{docs().map((doc) => <li key={doc.title}>{score(doc, term())}</li>)}</ul>
}
`))
})
