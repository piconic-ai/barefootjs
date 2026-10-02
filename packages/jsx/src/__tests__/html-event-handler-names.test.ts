/**
 * Every event handler typed on `HTMLBaseAttributes` (and the
 * `BaseEventAttributes` it extends) must compile to a real DOM event name
 * (#3273).
 *
 * The types (`html-types.ts`) and the compiler's JSX → DOM event-name
 * conversion (`toDomEventName`) are two independent answers to "which events
 * can a JSX element listen to". A typed prop whose lowered name is not a DOM
 * event type-checks and compiles, but the listener never fires. This test
 * joins the two: it reads the handler props from `html-types.ts` with a TS
 * AST walk, compiles each one through `compileJSX`, and checks the emitted
 * `addEventListener` name against the DOM lib's `HTMLElementEventMap`.
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileJSX } from '..'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'

const HTML_TYPES_PATH = resolve(import.meta.dir, '../html-types.ts')

// Typed before this test existed, and not a DOM event: `dragexit` was
// dropped from the HTML spec and no browser fires it. Kept typed so existing
// code keeps compiling; this set may only shrink.
const NOT_A_DOM_EVENT = new Set(['onDragExit'])

function collectHandlerProps(): string[] {
  const source = ts.createSourceFile(
    HTML_TYPES_PATH,
    readFileSync(HTML_TYPES_PATH, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  )
  const names: string[] = []
  for (const stmt of source.statements) {
    if (!ts.isInterfaceDeclaration(stmt)) continue
    if (stmt.name.text !== 'BaseEventAttributes' && stmt.name.text !== 'HTMLBaseAttributes') continue
    for (const member of stmt.members) {
      if (!ts.isPropertySignature(member) || !ts.isIdentifier(member.name)) continue
      if (/^on[A-Z]/.test(member.name.text)) names.push(member.name.text)
    }
  }
  return names
}

function collectDomEventNames(): Set<string> {
  const libDir = resolve(require.resolve('typescript'), '..')
  const program = ts.createProgram({
    rootNames: [resolve(libDir, 'lib.dom.d.ts')],
    options: { noLib: true },
  })
  const checker = program.getTypeChecker()
  const dom = program.getSourceFile(resolve(libDir, 'lib.dom.d.ts'))!
  const decl = dom.statements.find(
    (s): s is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(s) && s.name.text === 'HTMLElementEventMap',
  )!
  const type = checker.getTypeAtLocation(decl.name)
  return new Set(checker.getPropertiesOfType(type).map(p => p.name))
}

function compiledEventName(prop: string): string | undefined {
  const source = `
    "use client"
    export function Test() {
      return <div ${prop}={() => {}}>x</div>
    }
  `
  const result = compileJSX(source, 'Test.tsx', { adapter: new HonoAdapter() })
  const js = result.files.find(f => f.type === 'clientJs')?.content ?? ''
  return js.match(/addEventListener\('([^']+)'/)?.[1]
}

describe('typed JSX event handlers compile to DOM events (#3273)', () => {
  const props = collectHandlerProps()
  const domEvents = collectDomEventNames()

  test('the handler set includes the pointer events from #3273', () => {
    for (const name of [
      'onPointerCancel',
      'onPointerOver',
      'onPointerOut',
      'onGotPointerCapture',
      'onLostPointerCapture',
    ]) {
      expect(props).toContain(name)
    }
  })

  for (const prop of props) {
    if (NOT_A_DOM_EVENT.has(prop)) continue
    test(`${prop} → a DOM event`, () => {
      const eventName = compiledEventName(prop)
      expect(eventName).toBeDefined()
      expect(domEvents.has(eventName!)).toBe(true)
    })
  }

  test('NOT_A_DOM_EVENT only lists typed props that really are not DOM events', () => {
    for (const prop of NOT_A_DOM_EVENT) {
      expect(props).toContain(prop)
      expect(domEvents.has(compiledEventName(prop)!)).toBe(false)
    }
  })
})
