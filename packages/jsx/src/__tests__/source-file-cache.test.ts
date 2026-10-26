/**
 * `createAnchoredProgram` shares parsed SourceFiles between the Programs it
 * builds (#3666): the conformance harness builds one per compile, and
 * re-parsing `lib.*.d.ts` and `@barefootjs/client`'s declarations for each
 * was most of an adapter suite's run time.
 *
 * Pinned here: a declaration file is parsed once across Programs, a
 * different source under the same virtual name is parsed again (never
 * served stale), and a Program built from cached files still types a
 * `@barefootjs/client` import with its real declarations.
 */
import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { createAnchoredProgram, SourceFileCache } from '../analyzer'

const ANCHOR = resolve(import.meta.dir, '__virtual__')

// The `.map(` puts the source behind `needsTypeBasedDetection`'s gate, so
// `createAnchoredProgram` builds a Program for it.
const counterSource = (initial: string) => `
'use client'
import { createSignal } from '@barefootjs/client'
export function Counter() {
  const [count] = createSignal(${initial})
  return <ul>{[count()].map((c) => <li>{c}</li>)}</ul>
}
`

function libFile(program: NonNullable<ReturnType<typeof createAnchoredProgram>>) {
  const lib = program.getSourceFiles().find((f) => /lib\.es5\.d\.ts$/.test(f.fileName))
  if (!lib) throw new Error('lib.es5.d.ts not in the Program')
  return lib
}

describe('createAnchoredProgram SourceFile sharing', () => {
  test('a declaration file is the same SourceFile object in consecutive Programs', () => {
    const a = createAnchoredProgram(counterSource('0'), 'Counter.tsx', ANCHOR)!
    const b = createAnchoredProgram(counterSource('1'), 'Other.tsx', ANCHOR)!
    expect(libFile(b)).toBe(libFile(a))
  })

  test('a different source under the same virtual name is parsed again', () => {
    const a = createAnchoredProgram(counterSource('0'), 'Counter.tsx', ANCHOR)!
    const b = createAnchoredProgram(counterSource("'x'"), 'Counter.tsx', ANCHOR)!
    expect(b.getSourceFile('Counter.tsx')!.text).toBe(counterSource("'x'"))
    expect(b.getSourceFile('Counter.tsx')).not.toBe(a.getSourceFile('Counter.tsx'))
  })

  test('a Program built from cached files still resolves @barefootjs/client types', () => {
    createAnchoredProgram(counterSource('0'), 'Counter.tsx', ANCHOR)
    const program = createAnchoredProgram(counterSource('0'), 'Counter.tsx', ANCHOR)!
    const checker = program.getTypeChecker()
    const file = program.getSourceFile('Counter.tsx')!
    const text = file.text
    const pos = text.indexOf('count()')
    // The token at `count` is the signal getter: typed by the client's
    // declarations, not `any`.
    const node = findToken(file, pos)
    expect(checker.typeToString(checker.getTypeAtLocation(node))).not.toBe('any')
  })
})

describe('SourceFileCache', () => {
  test('reuses an entry only while its text is unchanged', () => {
    const cache = new SourceFileCache()
    const first = cache.get('/x/a.d.ts', 99, 'export declare const a: number')
    expect(cache.get('/x/a.d.ts', 99, 'export declare const a: number')).toBe(first)
    const changed = cache.get('/x/a.d.ts', 99, 'export declare const a: string')
    expect(changed).not.toBe(first)
    expect(changed.text).toBe('export declare const a: string')
  })
})

function findToken(file: import('typescript').SourceFile, pos: number): import('typescript').Node {
  let found: import('typescript').Node = file
  const visit = (node: import('typescript').Node) => {
    if (node.getStart(file) <= pos && pos < node.getEnd()) {
      found = node
      node.forEachChild(visit)
    }
  }
  file.forEachChild(visit)
  return found
}
