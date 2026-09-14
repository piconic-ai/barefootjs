import { describe, test } from 'bun:test'
import { compileJSX } from '../index'
import { HonoAdapter } from '../../../adapter-hono/src/adapter'

const SYNC = `'use client'
import { createMemo, createSignal } from '@barefootjs/client'
type Doc = { title: string }
const score = (doc: Doc, term: string): number => (doc.title.includes(term) ? 1 : 0)
function Search() {
  const [term, setTerm] = createSignal('')
  const [docs, setDocs] = createSignal<Doc[]>([{ title: 'hello' }])
  const results = createMemo(() => docs().map((doc) => ({ doc, s: score(doc, term()) })))
  return <div>{results().length}</div>
}
export default Search
`

const ASYNC = `'use client'
import { createSignal, onMount } from '@barefootjs/client'
const loadData = async (): Promise<string[]> => {
  const res = await fetch('/data.json')
  return res.json()
}
function Widget() {
  const [items, setItems] = createSignal<string[]>([])
  onMount(() => { void loadData().then(setItems) })
  return <div>{items().length}</div>
}
export default Widget
`

const FN_SYNC = `'use client'
import { createMemo, createSignal } from '@barefootjs/client'
type Doc = { title: string }
function score(doc: Doc, term: string): number { return doc.title.includes(term) ? 1 : 0 }
function Search() {
  const [term, setTerm] = createSignal('')
  const [docs, setDocs] = createSignal<Doc[]>([{ title: 'hello' }])
  const results = createMemo(() => docs().map((doc) => ({ doc, s: score(doc, term()) })))
  return <div>{results().length}</div>
}
export default Search
`

const FN_ASYNC = `'use client'
import { createSignal, onMount } from '@barefootjs/client'
async function loadData(): Promise<string[]> {
  const res = await fetch('/data.json')
  return res.json()
}
function Widget() {
  const [items, setItems] = createSignal<string[]>([])
  onMount(() => { void loadData().then(setItems) })
  return <div>{items().length}</div>
}
export default Widget
`

function dump(label: string, src: string) {
  const r = compileJSX(src, 'Repro.tsx', { adapter: new HonoAdapter() })
  console.log(`\n\n=========== ${label} ===========`)
  console.log('--- errors/warnings ---')
  console.log(JSON.stringify(r.errors, null, 2))
  for (const f of r.files) {
    console.log(`--- file type=${f.type} path=${(f as any).path} ---`)
    console.log(f.content)
  }
}

describe('repro 2986', () => {
  test('sync arrow const', () => dump('SYNC ARROW CONST', SYNC))
  test('async arrow const', () => dump('ASYNC ARROW CONST', ASYNC))
  test('sync function decl', () => dump('SYNC FUNCTION DECL', FN_SYNC))
  test('async function decl', () => dump('ASYNC FUNCTION DECL', FN_ASYNC))
})
