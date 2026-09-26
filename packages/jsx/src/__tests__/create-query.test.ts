/**
 * `createQuery` recognition (#3165): the value is collected as a signal
 * seeded from `options.initial`, the request function is emitted into the
 * client JS only, and reads of the action in template positions are refused
 * (BF117). Cross-adapter output lives in the `create-query-*` conformance
 * fixtures; this file pins the compiler-internal decisions.
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import path from 'path'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'
import { extractInitBody, extractTemplateBody } from './staged-ir/helpers'

function compile(source: string, options: { hono?: boolean; program?: ts.Program; fileName?: string } = {}) {
  const fileName = options.fileName ?? 'Component.tsx'
  const result = compileJSX(source, fileName, {
    adapter: options.hono ? new HonoAdapter() : new TestAdapter(),
    ...(options.program ? { program: options.program } : {}),
  })
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

/**
 * A program whose `@barefootjs/client` resolves to the real sources, so the
 * TypeChecker sees `createQuery`'s real signature (aliases, `Reactive` brands).
 */
function programFor(source: string, componentPath: string): ts.Program {
  const repo = path.resolve(__dirname, '../../../..')
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    paths: {
      '@barefootjs/client': [path.join(repo, 'packages/client/src/index.ts')],
      '@barefootjs/client/async': [path.join(repo, 'packages/client/src/async.ts')],
      '@barefootjs/client/reactive': [path.join(repo, 'packages/client/src/reactive.ts')],
    },
  }
  const defaultHost = ts.createCompilerHost(compilerOptions)
  const host: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile(fileName, languageVersion) {
      if (path.resolve(fileName) === componentPath) {
        return ts.createSourceFile(fileName, source, languageVersion, true, ts.ScriptKind.TSX)
      }
      return defaultHost.getSourceFile(fileName, languageVersion)
    },
    fileExists(fileName) {
      return path.resolve(fileName) === componentPath || defaultHost.fileExists(fileName)
    },
    readFile(fileName) {
      return path.resolve(fileName) === componentPath ? source : defaultHost.readFile(fileName)
    },
  }
  return ts.createProgram([componentPath], compilerOptions, host)
}

const MODE_A = `
'use client'
import { createQuery, http } from '@barefootjs/client'
type Post = { id: number; title: string }
export function PostList(props: { posts: Post[]; userId: number }) {
  const [posts, fetchPosts] = createQuery(() => http.get<Post[]>('/api/posts?user=' + props.userId), { initial: props.posts })
  return (
    <div>
      <ul>{posts().map((post) => <li key={post.id}>{post.title}</li>)}</ul>
      <button onClick={() => fetchPosts()}>reload</button>
    </div>
  )
}
`

describe('createQuery value and client JS (#3165)', () => {
  test('emits the factory call with props read live, and no createSignal or prop sync for it', () => {
    const { codes, initBody } = compile(MODE_A)
    expect(codes).toEqual([])
    expect(initBody).toContain(
      "const [posts, fetchPosts] = createQuery(() => http.get('/api/posts?user=' + _p.userId), { initial: _p.posts })",
    )
    expect(initBody).not.toContain('createSignal(')
    // `initial` is taken once: no controlled-prop sync effect writes the prop back.
    expect(initBody).not.toContain('fetchPosts(__val)')
  })

  test('the CSR template reads `initial`, never the request function', () => {
    const { templateBody } = compile(MODE_A)
    expect(templateBody).toContain('(_p.posts).map(')
    expect(templateBody).not.toContain('http.get')
  })

  test('Hono SSR seeds the value from `initial` and never emits the request function', () => {
    const { codes, ssr } = compile(MODE_A, { hono: true })
    expect(codes).toEqual([])
    expect(ssr).toContain('const posts = () => props.posts')
    expect(ssr).not.toContain('http.get')
    // A prop read only by the request function still reaches the client.
    expect(ssr).toContain("__hydrateProps['userId'] = props.userId")
  })

  test('an aliased import re-emits the call through the alias', () => {
    // Aliases resolve through the TypeChecker, as for every reactive primitive.
    const source = `
'use client'
import { createQuery as query, http } from '@barefootjs/client'
export function C(props: { items: string[] }) {
  const [items] = query(() => http.get<string[]>('/api/items'), { initial: props.items })
  return <ul>{items().map((i) => <li key={i}>{i}</li>)}</ul>
}
`
    const componentPath = path.join(__dirname, '_create-query-alias.tsx')
    const { codes, initBody } = compile(source, { program: programFor(source, componentPath), fileName: componentPath })
    expect(codes).toEqual([])
    expect(initBody).toContain("const [items] = query(() => http.get('/api/items'), { initial: _p.items })")
  })

  test('the value-elided form keeps just the action', () => {
    const { codes, initBody } = compile(`
'use client'
import { createQuery, http } from '@barefootjs/client'
export function C() {
  const [, fetchItems] = createQuery(() => http.get<string[]>('/api/items'))
  return <button onClick={() => fetchItems()}>load</button>
}
`)
    expect(codes).toEqual([])
    expect(initBody).toContain("const [, fetchItems] = createQuery(() => http.get('/api/items'))")
  })

  test('`initial` absent seeds undefined; a shorthand `initial` is read structurally', () => {
    const absent = compile(`
'use client'
import { createQuery, http } from '@barefootjs/client'
export function C() {
  const [items] = createQuery(() => http.get<string[]>('/api/items'))
  return <p>{items() ? 'loaded' : 'loading'}</p>
}
`, { hono: true })
    expect(absent.codes).toEqual([])
    expect(absent.ssr).toContain('const items = () => undefined')

    const shorthand = compile(`
'use client'
import { createQuery, http } from '@barefootjs/client'
export function C({ initial }: { initial?: string[] }) {
  const [items] = createQuery(() => http.get<string[]>('/api/items'), { initial })
  return <p>{items() ? 'loaded' : 'loading'}</p>
}
`, { hono: true })
    expect(shorthand.codes).toEqual([])
    expect(shorthand.ssr).toContain('const items = () => initial')
  })

  test('options that cannot be read structurally seed from a member read of the options', () => {
    const { codes, ssr } = compile(`
'use client'
import { createQuery, http } from '@barefootjs/client'
export function C(props: { base: { initial?: string[] } }) {
  const [items] = createQuery(() => http.get<string[]>('/api/items'), { ...props.base, ttl: 1000 })
  return <p>{items() ? 'loaded' : 'loading'}</p>
}
`, { hono: true })
    expect(codes).toEqual([])
    expect(ssr).toContain('const items = () => ({ ...props.base, ttl: 1000 }).initial')
  })

  test('a forwarded action gets an SSR no-op', () => {
    const { codes, ssr } = compile(`
'use client'
import { createQuery, http } from '@barefootjs/client'
function Retry(props: { onRetry: () => void }) {
  return <button onClick={() => props.onRetry()}>retry</button>
}
export function C(props: { items: string[] }) {
  const [items, fetchItems] = createQuery(() => http.get<string[]>('/api/items'), { initial: props.items })
  return <div><p>{items().length}</p><Retry onRetry={fetchItems} /></div>
}
`, { hono: true, fileName: 'C.tsx' })
    expect(codes).toEqual([])
    expect(ssr).toContain('const fetchItems: any = () => {}')
  })
})

describe('createQuery arity (BF115 / BF116)', () => {
  test('a two-argument call and a two-element destructure are accepted', () => {
    expect(compile(MODE_A).codes).toEqual([])
  })

  test('a three-element destructure is BF115', () => {
    const { codes } = compile(`
'use client'
import { createQuery, http } from '@barefootjs/client'
export function C() {
  const [a, b, c] = createQuery(() => http.get('/api/items'))
  return <p>{a()}</p>
}
`)
    expect(codes).toContain('BF115')
  })

  test('a third argument is BF116', () => {
    const { codes } = compile(`
'use client'
import { createQuery, http } from '@barefootjs/client'
export function C() {
  const [a] = createQuery(() => http.get('/api/items'), {}, 'extra')
  return <p>{a()}</p>
}
`)
    expect(codes).toContain('BF116')
  })
})

const ACTION_READS = `
'use client'
import { createMemo, createQuery, http } from '@barefootjs/client'
type Post = { id: number; title: string }
export function PostList(props: { posts: Post[] }) {
  const [posts, fetchPosts] = createQuery(() => http.get<Post[]>('/api/posts'), { initial: props.posts })
  const busy = createMemo(() => fetchPosts.isPending())
  return (
    <div aria-busy={fetchPosts.isPending()}>
      {fetchPosts.error() ? <p>failed</p> : null}
      <span>{busy() ? 'loading' : 'ready'}</span>
      <ul>{posts().map((post) => <li key={post.id}>{post.title}</li>)}</ul>
    </div>
  )
}
`

describe('BF117: query action reads in template positions', () => {
  test('refuses accessor reads in attributes and conditions, and memos that read the action', () => {
    const { errors } = compile(ACTION_READS)
    const bf117 = errors.filter((e) => e.code === 'BF117')
    expect(bf117.map((e) => e.loc.start.line)).toEqual([9, 10, 11])
    expect(bf117[0].message).toContain("'fetchPosts.isPending' reads a query action's accessor")
    expect(bf117[2].message).toContain("'busy' reads the query action 'fetchPosts'")
    expect(bf117[0].suggestion?.escape).toEqual([{ kind: 'client-directive' }])
  })

  test('fires on Hono too', () => {
    expect(compile(ACTION_READS, { hono: true }).codes.filter((c) => c === 'BF117')).toHaveLength(3)
  })

  test('refuses calling the action in a template position', () => {
    const { codes } = compile(`
'use client'
import { createQuery, http } from '@barefootjs/client'
export function C() {
  const [items, fetchItems] = createQuery(() => http.get<string[]>('/api/items'))
  return <p>{String(fetchItems())}</p>
}
`)
    expect(codes).toContain('BF117')
  })

  test('allows /* @client */ reads, event handlers, and forwarding the action as a value', () => {
    const { codes } = compile(`
'use client'
import { createQuery, http } from '@barefootjs/client'
function Retry(props: { onRetry: () => void; run: () => void }) {
  return <button onClick={() => props.onRetry()}>retry</button>
}
export function C(props: { items: string[] }) {
  const [items, fetchItems] = createQuery(() => http.get<string[]>('/api/items'), { initial: props.items })
  return (
    <div aria-busy={/* @client */ fetchItems.isPending()}>
      <button onClick={() => fetchItems()}>{items().length}</button>
      <Retry onRetry={() => fetchItems()} run={fetchItems} />
    </div>
  )
}
`, { fileName: 'C.tsx' })
    expect(codes).not.toContain('BF117')
  })

  test('with a TypeChecker, accessor reads are refused rather than auto-deferred to the client', () => {
    const componentPath = path.join(__dirname, '_create-query-component.tsx')
    const program = programFor(ACTION_READS, componentPath)
    // Sanity: the checker sees the accessor as a reactive brand, which is
    // what would auto-defer it without the async-action exclusion.
    const checker = program.getTypeChecker()
    const sourceFile = program.getSourceFile(componentPath)!
    let accessorType = ''
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node) && node.getText(sourceFile) === 'fetchPosts.isPending' && !accessorType) {
        accessorType = checker.typeToString(checker.getTypeAtLocation(node))
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    expect(accessorType).toStartWith('Reactive<')

    const { codes } = compile(ACTION_READS, { program, fileName: componentPath })
    expect(codes.filter((c) => c === 'BF117')).toHaveLength(3)
  })
})
