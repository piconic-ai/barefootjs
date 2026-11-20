/**
 * Differential audit for #3719's `checkStatementWrites`: a small,
 * deterministic grammar of component bodies, each a holder of a binding a
 * body statement writes, a value derived from that holder, and a consumer
 * constant computed from the derived value, placed before or after the
 * statement. Each program is compiled with the real compiler, and every one
 * it accepts is mounted with the real runtime; the value the mounted
 * component's handler sees must be the one plain JavaScript computes by
 * running the same body in order. A program the compiler refuses (BF101) is
 * checked against a model of init's order (every declaration, then the
 * statement): one refused where that model agrees with JS is an
 * over-refusal, counted and pinned so the count only shrinks.
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import ts from 'typescript'
import { compileJSX } from '../../../jsx/src/compiler'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { writeFileSync, rmSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

const runtimePath = join(__dirname, '../../src/runtime/index.ts')
const clientPath = join(__dirname, '../../src/index.ts')

function relink(clientJs: string): string {
  const sf = ts.createSourceFile('client.mjs', clientJs, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const edits: Array<{ start: number; end: number; text: string }> = []
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
    const spec = stmt.moduleSpecifier
    if (!stmt.importClause) edits.push({ start: stmt.getFullStart(), end: stmt.getEnd(), text: '' })
    else if (spec.text === '@barefootjs/client/runtime') edits.push({ start: spec.getStart(sf), end: spec.getEnd(), text: JSON.stringify(runtimePath) })
    else if (spec.text === '@barefootjs/client') edits.push({ start: spec.getStart(sf), end: spec.getEnd(), text: JSON.stringify(clientPath) })
  }
  let out = clientJs
  for (const edit of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return out
}

/** The value every program reports: what a list currently is. */
const FP = `function fp(a) { return a.length + ':' + a[0].v + ':' + String(a.tag) }
function same(x) { return x }`

/** A holder of `local`, and how to reach the list from a value of it. */
const HOLDERS: Record<string, { init: string; reach: (v: string) => string; array: boolean }> = {
  self: { init: 'local', reach: v => `fp(${v})`, array: true },
  closureObj: { init: '{ read: () => fp(local) }', reach: v => `${v}.read()`, array: false },
  closureArr: { init: '[() => fp(local)]', reach: v => `${v}[0]()`, array: true },
  dataArr: { init: '[local]', reach: v => `fp(${v}[0])`, array: true },
  nestedObj: { init: '{ inner: { list: local } }', reach: v => `fp(${v}.inner.list)`, array: false },
  closureViaCall: { init: 'same({ read: () => fp(local) })', reach: v => `${v}.read()`, array: false },
  closureFromIife: { init: '(() => [() => fp(local)])()', reach: v => `${v}[0]()`, array: true },
  getter: { init: '{ get n() { return fp(local) } }', reach: v => `${v}.n`, array: false },
  staticField: { init: 'class { static read = () => fp(local) }', reach: v => `${v}.read()`, array: false },
}

/** A value derived from the holder `h`: its declarations, and the expression the consumer reads. */
const DERIVES: Record<string, { decls: (array: boolean) => string[] | null; value: string }> = {
  none: { decls: () => [], value: 'h' },
  alias: { decls: () => ['const d = h'], value: 'd' },
  spread: { decls: array => [array ? 'const d = [...h]' : 'const d = { ...h }'], value: 'd' },
  slice: { decls: array => (array ? ['const d = h.slice()'] : null), value: 'd' },
  viaObject: { decls: () => ['const t = { v: h }', 'const d = t.v'], value: 'd' },
  viaCall: { decls: () => ['const d = same(h)'], value: 'd' },
  memo: { decls: () => ['const d = createMemo(() => h)'], value: 'd()' },
  signal: { decls: () => ['const [d] = createSignal(h)'], value: 'd()' },
}

const WRITES: Record<string, { decl: string; statement: string }> = {
  push: { decl: 'const', statement: 'local.push({ v: 2 })' },
  deep: { decl: 'const', statement: 'local[0].v = 5' },
  reassign: { decl: 'let', statement: 'local = [{ v: 1 }, { v: 2 }]' },
  property: { decl: 'const', statement: 'local.tag = 7' },
}

const CONSUMERS: Record<string, (value: string, reach: (v: string) => string) => string[]> = {
  direct: (value, reach) => [`const n = ${reach(value)}`],
  aliasOfAlias: (value, reach) => [`const a1 = ${value.endsWith('()') ? value.slice(0, -2) : value}`, 'const a2 = a1', `const n = ${reach(value.endsWith('()') ? 'a2()' : 'a2')}`],
}

interface Program {
  id: string
  head: string
  decls: string[]
  statement: string
  /** Where the statement stands among `decls`. */
  at: number
}

function programs(): Program[] {
  const out: Program[] = []
  for (const [hk, holder] of Object.entries(HOLDERS)) {
    for (const [dk, derive] of Object.entries(DERIVES)) {
      const derived = derive.decls(holder.array)
      if (!derived) continue
      for (const [wk, write] of Object.entries(WRITES)) {
        for (const [ck, consumer] of Object.entries(CONSUMERS)) {
          const decls = [`const h = ${holder.init}`, ...derived, ...consumer(derive.value, holder.reach)]
          // The statement after the holder at the earliest (a holder after
          // it reads the written list, which the direct tests cover).
          for (let at = 1; at <= decls.length; at++) {
            out.push({ id: `${hk}.${dk}.${wk}.${ck}.${at}`, head: `${write.decl} local = [{ v: 1 }]`, decls, statement: write.statement, at })
          }
        }
      }
    }
  }
  return out
}

function runJs(body: string): string {
  const shims = 'const createMemo = f => { const v = f(); return () => v }; const createSignal = v => [() => v, () => {}];'
  return JSON.stringify(new Function(`${FP}\n${shims}\n${body}\nreturn n`)())
}

/** JavaScript's order, and init's (every declaration first, then the statement). */
function bodies(p: Program): { js: string; init: string } {
  const js = [p.head, ...p.decls.slice(0, p.at), p.statement, ...p.decls.slice(p.at)].join('\n')
  const init = [p.head, ...p.decls, p.statement].join('\n')
  return { js, init }
}

function source(p: Program, name: string): string {
  const body = bodies(p).js.split('\n').map(l => `  ${l}`).join('\n')
  return `'use client'
import { createMemo, createSignal } from '@barefootjs/client'
${FP}
export function ${name}() {
${body}
  return <button onClick={() => { (globalThis as any).__bfAudit = n }}>x</button>
}
`
}

interface Outcome {
  id: string
  js: string
  init: string
  refused: string[]
  mounted?: string
}

describe('#3719: differential audit of statement-write refusals', () => {
  const all = programs()
  const outcomes: Outcome[] = []

  test(`${all.length} programs compile or are refused as JS and the client's init agree`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-3719-audit-'))
    const { createComponent } = await import('../../src/runtime')
    try {
      let i = 0
      for (const p of all) {
        const name = `Audit${i++}`
        const { js, init } = bodies(p)
        const outcome: Outcome = { id: p.id, js: runJs(js), init: runJs(init), refused: [] }
        const result = compileJSX(source(p, name), `${name}.tsx`, { adapter: new TestAdapter() })
        outcome.refused = result.errors.filter(e => e.severity === 'error').map(e => e.code)
        if (outcome.refused.length === 0) {
          const clientJs = result.files.find(f => f.type === 'clientJs')?.content ?? ''
          const file = join(dir, `${name}.mjs`)
          writeFileSync(file, relink(clientJs))
          await import(file)
          const el = createComponent(name, {}) as HTMLElement
          document.body.appendChild(el)
          ;(globalThis as Record<string, unknown>).__bfAudit = undefined
          el.click()
          outcome.mounted = JSON.stringify((globalThis as Record<string, unknown>).__bfAudit)
          el.remove()
        }
        outcomes.push(outcome)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    const unsound = outcomes.filter(o => o.mounted !== undefined && o.mounted !== o.js)
    expect(unsound.map(o => `${o.id}: client ${o.mounted}, JS ${o.js}`)).toEqual([])
    // The model of init's order is what the mount computes.
    const modelled = outcomes.filter(o => o.mounted !== undefined && o.mounted !== o.init)
    expect(modelled.map(o => o.id)).toEqual([])
    // Refused although init's order computes what JS does. Each is a
    // conservative answer the analysis cannot tell apart from an unsound
    // one: a copy of a holder that aliases the binding (`[...h]` after
    // `const h = local`; the alias may be the binding or hold it), a copy
    // made after a property write it does not copy, and a spread of a
    // getter, which runs the getter now but keeps nothing. The count may
    // only go down (`BF_AUDIT_LIST=1` prints them).
    const overRefused = outcomes.filter(o => o.refused.length > 0 && o.init === o.js)
    expect(overRefused.length).toBe(36)
    if (process.env.BF_AUDIT_LIST) {
      for (const o of overRefused) console.log(`over-refused ${o.id} [${o.refused.join(',')}]`)
    }
    console.log(`audit: ${outcomes.length} programs, ${outcomes.filter(o => o.mounted !== undefined).length} accepted, ${outcomes.filter(o => o.refused.length > 0).length} refused, ${overRefused.length} over-refused`)
  }, 120_000)
})
