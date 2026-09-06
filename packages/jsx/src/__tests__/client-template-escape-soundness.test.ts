/**
 * Escape-by-default soundness for client HTML templates (#2795), made
 * executable — the escaping twin of `map-body-no-silent-divergence.test.ts`.
 *
 * For EVERY shape below, exactly one of these must hold:
 *   1. it compiles clean AND every `${...}` hole in every HTML template
 *      literal of the emitted client JS is an ALLOWED FORM — an escaping
 *      runtime call, a named trusted producer, or a structural form whose
 *      own nested templates are checked in turn — and no escaping call wraps
 *      another (double escape, the failure a half-finished migration
 *      produces); or
 *   2. the compiler raises a BF error (loud, actionable refusal).
 *
 * A shape that compiles clean but splices a bare expression into HTML is a
 * SILENT HOLE — the class #1694 and #2765/#2792 belonged to. Both are pinned
 * below as executable assertions, plus the inlined-constant shape the #2795
 * design predicted and this migration closed.
 *
 * The check parses the emitted JS with the TS AST (never regex over code —
 * CLAUDE.md), walks every template literal whose static text contains an
 * HTML tag/comment opener, and classifies each hole. Nested row/branch
 * templates that carry no static text of their own are reached through the
 * structural forms that own them (a conditional's branches, a mapped-rows
 * arrow's return). Argument subtrees of an allowed call are not treated as
 * holes — a user expression inside `escapeText(...)` may legitimately be a
 * template literal — but the walk still visits any HTML template nested in
 * them (a `bfMarkup(\`<strong>...\`)` prop, say).
 *
 * `KNOWN_HOLES` pins the exact current reality and may only shrink.
 *
 * Alongside the output ratchet, two source-level pins keep the emitter's
 * structure honest: the exact count of hand-written `\${` in
 * `html-template.ts` (every child-position hole goes through `interp`;
 * only the attribute-side holes remain, see `safe-html.ts`'s header), and
 * the initial-render `escapeTextOrMarkup` slot set equalling the reactive
 * `kind: 'markup'` claim set (`markup-slots.ts`).
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

interface Shape {
  id: string
  source: string
  /** Shape-specific pins on the emitted client JS (only run for sound shapes). */
  pin?: (clientJs: string) => void
}

/** Shapes that are silent holes today. Shrink-only — never add entries. */
const KNOWN_HOLES: ReadonlySet<string> = new Set([])

const shapes: Shape[] = [
  {
    // #1694 — the first member of the family: a plain prop in text position
    // shipped as `${_p.text}`. Pinned via the static-template builder.
    id: '1694-prop-text-static-template',
    source: `
export function Label({ text }: { text: string }) {
  return <span>{text}</span>
}`,
    pin: (js) => {
      expect(js).toMatch(/<!--bf:\w+-->\$\{escapeTextOrMarkup\(_p\.text\)\}<!--\/-->/)
    },
  },
  {
    id: '1694-prop-text-use-client',
    source: `
'use client'
export function Label({ text }: { text: string }) {
  return <span>{text}</span>
}`,
    pin: (js) => {
      expect(js).toMatch(/<!--bf:\w+-->\$\{escapeTextOrMarkup\(_p\.text\)\}<!--\/-->/)
    },
  },
  {
    // #2765 — a controlled <textarea>'s value, lowered into element content,
    // spliced raw by the loop-row builder (`irToHtmlTemplate`).
    id: '2765-textarea-value-loop-row',
    source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function Notes() {
  const [items] = createSignal([{ id: '1', t: 'x' }])
  return <ul>{items().map(i => <li key={i.id}><textarea value={i.t} /></li>)}</ul>
}`,
    pin: (js) => expectEveryTextareaEscaped(js),
  },
  {
    // #2792 — the identical miss in the composite-row builder
    // (`irToPlaceholderTemplate`): a row that also hosts a child component
    // renders through placeholders, a second code path the #2765 fix missed.
    id: '2792-textarea-value-composite-row',
    source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Child } from './Child'
export function Notes() {
  const [items] = createSignal([{ id: '1', t: 'x' }])
  return <ul>{items().map(i => <li key={i.id}><Child /><textarea value={i.t} /></li>)}</ul>
}`,
    pin: (js) => {
      expect(js).toContain('data-bf-ph=')
      expectEveryTextareaEscaped(js)
    },
  },
  {
    id: 'textarea-value-static-template',
    source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NoteBox() {
  const [note, setNote] = createSignal('hi')
  return <textarea value={note()} onInput={(e) => setNote(e.target.value)} />
}`,
    pin: (js) => expectEveryTextareaEscaped(js),
  },
  {
    // #2795 §8.4 — a module-scope string constant gets no slot and is
    // constant-inlined into the bare-splice fallthrough; before this
    // migration it reached the template as `${('a<b')}`, raw.
    id: '2795-inlined-constant-text',
    source: `
const LABEL = 'a<b'
export function C() {
  return <div>{LABEL}</div>
}`,
    pin: (js) => {
      expect(js).toContain("${escapeText(('a<b'))}")
      expect(js).not.toContain("${('a<b')}")
    },
  },
  {
    // A string literal in a conditional branch has no slot and used to
    // reach the template raw (`${'ON'}`) — a `'<b>'` literal would have
    // been markup on the client and text on the server. Now escaped.
    id: 'conditional-string-literal-branch',
    source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function Toggle() {
  const [on, setOn] = createSignal(false)
  return <button onClick={() => setOn(!on())}>{on() ? 'ON' : 'OFF'}</button>
}`,
    pin: (js) => {
      expect(js).toContain("${escapeText('ON')}")
      expect(js).not.toContain("${'ON'}")
    },
  },
  {
    // The trusted opt-out that must survive: `{children}` is already HTML.
    id: 'children-passthrough',
    source: `
export function Box({ children }: { children?: any }) {
  return <div>{children}</div>
}`,
    pin: (js) => expect(js).toContain('${markupOrEmpty(_p.children)}'),
  },
  {
    // #2786 — destructured-and-renamed children resolves to `(_p.children)`.
    id: 'children-passthrough-renamed',
    source: `
export function Box(props: { children?: any }) {
  const { children: kids } = props
  return <div>{kids}</div>
}`,
    pin: (js) => expect(js).toContain('${markupOrEmpty((_p.children))}'),
  },
  {
    // The author-facing escape hatch, by name.
    id: 'dangerously-set-inner-html',
    source: `
export function Raw({ h }: { h: string }) {
  return <div dangerouslySetInnerHTML={{ __html: h }} />
}`,
    pin: (js) => expect(js).toContain(".__html ?? ''}"),
  },
  {
    // A conditional-branch template value goes through `__bfSlot` (raw
    // markers for live Nodes) and must never be wrapped a second time —
    // the regression #1694's fix itself caused (ex `text-slot-escaping`).
    id: 'branch-slot-value',
    source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function Branch({ show }: { show: boolean }) {
  const [t] = createSignal('hi')
  return <div>{show ? <span>{t()}</span> : null}</div>
}`,
    pin: (js) => {
      expect(js).toMatch(/\$\{__bfSlot\(/)
      expect(js).not.toMatch(/escapeTextOrMarkup\(\s*__bfSlot/)
      expect(js).not.toMatch(/escapeText\(\s*__bfSlot/)
    },
  },
  {
    // flatMap projection leaf — formerly escaped by the deleted
    // `escapeLeafTextExpressions` rewrite pass, now by the door.
    id: 'flatmap-projection-leaf',
    source: `
export function Tags({ todos }: { todos: { id: string; tags: string[] }[] }) {
  return <ul>{todos.flatMap(todo => todo.tags.map(tag => <li key={todo.id + tag}>{tag}</li>))}</ul>
}`,
    pin: (js) => expect(js).toContain('${escapeText(tag)}'),
  },
  {
    // Stage 3 / D4 array-builder preamble: `{out}` is an array of compiled
    // leaves (joined, trusted); the leaves' own text is escaped.
    id: 'preamble-array-child',
    source: `
export function T({ rows }: { rows: { id: string; cells: string[] }[] }) {
  return <table><tbody>{rows.map((r) => {
    const out = []
    for (const c of r.cells) out.push(<td>{c}</td>)
    return <tr key={r.id}>{out}</tr>
  })}</tbody></table>
}`,
    pin: (js) => {
      expect(js).toContain('${escapeText(c)}')
      expect(js).toContain('${Array.isArray(out) ? out.join')
    },
  },
  {
    // Loop param text inside a keyed row, plus an attribute hole.
    id: 'loop-row-text-and-attr',
    source: `
export function List({ items }: { items: { id: string; name: string; cls: string }[] }) {
  return <ul>{items.map(i => <li key={i.id} class={i.cls}>{i.name}</li>)}</ul>
}`,
  },
  {
    // Whole-item conditional loop: the `<!--bf-loop-i:KEY-->` anchor form.
    id: 'anchored-conditional-loop',
    source: `
export function List({ items }: { items: { id: string; on: boolean; name: string }[] }) {
  return <ul>{items.map(i => i.on ? <li key={i.id}>{i.name}</li> : null)}</ul>
}`,
  },
  {
    // Nested conditional inside a loop row.
    id: 'loop-row-nested-conditional',
    source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function List() {
  const [items] = createSignal([{ id: '1', on: true, name: 'a' }])
  return <ul>{items().map(i => <li key={i.id}>{i.on ? <b>{i.name}</b> : <i>off</i>}</li>)}</ul>
}`,
  },
  {
    // JSX passed at a non-`children` prop is compiler-branded markup.
    id: 'jsx-element-prop',
    source: `
import { Card } from './Card'
export function Page({ title }: { title: string }) {
  return <Card header={<strong>{title}</strong>}>body</Card>
}`,
  },
]

// ---------------------------------------------------------------------------
// The soundness predicate
// ---------------------------------------------------------------------------

/** Runtime helpers that escape their own input. Nesting two is a double escape. */
const ESCAPING_CALLS = new Set(['escapeText', 'escapeTextOrMarkup', '__bfSlot', 'escapeAttr'])
/** Runtime helpers whose output is markup by construction (`safe-html.ts`). */
const TRUSTED_CALLS = new Set(['markupOrEmpty', 'renderChild', 'spreadAttrs'])

interface Soundness {
  unsoundHoles: string[]
  doubleEscapes: string[]
  parseErrors: number
}

function strip(e: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(e)) e = e.expression
  return e
}

function isTemplateLike(e: ts.Expression): boolean {
  const s = strip(e)
  return ts.isTemplateExpression(s) || ts.isNoSubstitutionTemplateLiteral(s)
}

function isEmptyString(e: ts.Expression): boolean {
  const s = strip(e)
  return (ts.isStringLiteral(s) || ts.isNoSubstitutionTemplateLiteral(s)) && s.text === ''
}

/** `'lit' + escapeAttr(x) + '"'` chains — the attribute-hole shape. */
function isAttrConcat(e: ts.Expression): boolean {
  const s = strip(e)
  if (ts.isStringLiteral(s)) return true
  if (ts.isCallExpression(s) && ts.isIdentifier(s.expression) && s.expression.text === 'escapeAttr') return true
  if (ts.isBinaryExpression(s) && s.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return isAttrConcat(s.left) && isAttrConcat(s.right)
  }
  return false
}

/** Static template text that reads as HTML (a tag, a comment, or a close tag). */
function isHtmlTemplate(t: ts.TemplateExpression): boolean {
  const statics = [t.head.text, ...t.templateSpans.map(s => s.literal.text)].join('')
  return /<[A-Za-z!\/]/.test(statics)
}

/**
 * Classify one hole. Returns the allowed-form name, or `null` when the hole
 * is a bare (unescaped, untrusted) expression. `nested` receives any
 * template literal the form owns that must be checked even without static
 * HTML text of its own.
 */
function classifyHole(expr: ts.Expression, precedingStatic: string, nested: ts.TemplateExpression[]): string | null {
  const e = strip(expr)
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return 'literal'
  if (ts.isCallExpression(e)) {
    const callee = strip(e.expression)
    if (ts.isIdentifier(callee)) {
      if (ESCAPING_CALLS.has(callee.text)) return `escape:${callee.text}`
      if (TRUSTED_CALLS.has(callee.text)) return `trusted:${callee.text}`
    }
    // `array.method(params => body).join('')` — mappedRowsMarkup.
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'join' && ts.isCallExpression(strip(callee.expression))) {
      const inner = strip(callee.expression) as ts.CallExpression
      for (const arg of inner.arguments) {
        const fn = strip(arg)
        if (ts.isArrowFunction(fn)) {
          const body = fn.body
          if (ts.isTemplateExpression(body)) nested.push(body)
          else if (ts.isBlock(body)) {
            for (const st of body.statements) {
              if (ts.isReturnStatement(st) && st.expression && ts.isTemplateExpression(strip(st.expression))) {
                nested.push(strip(st.expression) as ts.TemplateExpression)
              }
            }
          }
        }
      }
      return 'rows'
    }
    // `((v) => ...)(styleToCss(x))` — the style attribute IIFE.
    if (ts.isArrowFunction(callee) && e.arguments.length === 1) {
      const arg = strip(e.arguments[0])
      if (ts.isCallExpression(arg) && ts.isIdentifier(arg.expression) && arg.expression.text === 'styleToCss') return 'style-attr'
    }
    return null
  }
  if (ts.isConditionalExpression(e)) {
    const cond = strip(e.condition)
    // `Array.isArray(out) ? out.join('') : (out ?? '')` — joinedMarkup.
    if (ts.isCallExpression(cond) && ts.isPropertyAccessExpression(cond.expression) && cond.expression.name.text === 'isArray') return 'join-array'
    // `cond ? \`...\` : \`...\`` — conditionalMarkup (branches checked in turn).
    if (isTemplateLike(e.whenTrue) && isTemplateLike(e.whenFalse)) {
      for (const b of [e.whenTrue, e.whenFalse]) {
        const s = strip(b)
        if (ts.isTemplateExpression(s)) nested.push(s)
      }
      return 'conditional-markup'
    }
    // `x ? 'attr' : ''` / `x != null ? 'attr="' + escapeAttr(x) + '"' : ''`.
    if (isAttrConcat(e.whenTrue) && (isEmptyString(e.whenFalse) || ts.isStringLiteral(strip(e.whenFalse)))) return 'attr'
    return null
  }
  // `((x) ?? {}).__html ?? ''` — dangerousInnerHtml, the named hatch.
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    const left = strip(e.left)
    if (ts.isPropertyAccessExpression(left) && left.name.text === '__html') return 'dangerous-inner-html'
  }
  // `<!--bf-loop-i:${KEY}-->` — the whole-item-conditional loop anchor
  // (`itemAnchorTemplate`). The key is spliced raw inside a marker comment
  // so the runtime can read it back verbatim; a key containing `-->` would
  // close the comment early. Pre-existing, outside the text-escaping family
  // this ratchet covers — pinned by name so it is visible, not forgotten.
  if (precedingStatic.endsWith('bf-loop-i:')) return 'loop-item-anchor-key'
  return null
}

function checkTemplate(t: ts.TemplateExpression, seen: Set<ts.Node>, out: Soundness): void {
  if (seen.has(t)) return
  seen.add(t)
  let preceding = t.head.text
  for (const span of t.templateSpans) {
    const nested: ts.TemplateExpression[] = []
    const form = classifyHole(span.expression, preceding, nested)
    const text = span.expression.getText()
    if (form === null) {
      out.unsoundHoles.push(text)
    } else if (form.startsWith('escape:')) {
      const call = strip(span.expression) as ts.CallExpression
      const arg = call.arguments[0] ? strip(call.arguments[0]) : undefined
      if (arg && ts.isCallExpression(arg) && ts.isIdentifier(arg.expression) && ESCAPING_CALLS.has(arg.expression.text)) {
        out.doubleEscapes.push(text)
      }
    }
    for (const n of nested) checkTemplate(n, seen, out)
    preceding = span.literal.text
  }
}

function soundnessOf(clientJs: string): Soundness {
  const sf = ts.createSourceFile('client.js', clientJs, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const out: Soundness = { unsoundHoles: [], doubleEscapes: [], parseErrors: (sf as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics.length }
  const seen = new Set<ts.Node>()
  const visit = (n: ts.Node): void => {
    if (ts.isTemplateExpression(n) && isHtmlTemplate(n)) checkTemplate(n, seen, out)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

function isSound(s: Soundness): boolean {
  return s.unsoundHoles.length === 0 && s.doubleEscapes.length === 0 && s.parseErrors === 0
}

function expectEveryTextareaEscaped(js: string): void {
  const opens = js.match(/<textarea\b/g) ?? []
  const escaped = js.match(/<textarea\b[^>]*>\$\{escapeText\(/g) ?? []
  expect(opens.length).toBeGreaterThan(0)
  expect(escaped.length).toBe(opens.length)
}

function compileShape(shape: Shape): { clientJs: string; hasBfError: boolean } {
  const result = compileJSX(shape.source, `${shape.id}.tsx`, { adapter: new TestAdapter() })
  const hasBfError = result.errors.some(e => e.severity === 'error' && /^BF\d+/.test(e.code))
  const clientJs = result.files.filter(f => f.type === 'clientJs').map(f => f.content).join('\n')
  return { clientJs, hasBfError }
}

// ---------------------------------------------------------------------------

describe('client template escape soundness (#2795)', () => {
  for (const shape of shapes) {
    test(shape.id, () => {
      const { clientJs, hasBfError } = compileShape(shape)
      if (hasBfError) return // loud refusal — trichotomy arm 2
      const s = soundnessOf(clientJs)
      const sound = isSound(s)
      if (KNOWN_HOLES.has(shape.id)) {
        // A listed hole that stops leaking must be removed from the set.
        expect(sound).toBe(false)
        return
      }
      if (!sound) {
        throw new Error(
          `silent hole in shape "${shape.id}":\n` +
          `  unsound holes: ${JSON.stringify(s.unsoundHoles)}\n` +
          `  double escapes: ${JSON.stringify(s.doubleEscapes)}\n` +
          `  parse errors: ${s.parseErrors}\n${clientJs}`,
        )
      }
      shape.pin?.(clientJs)
    })
  }

  test('KNOWN_HOLES only ever shrinks', () => {
    expect(KNOWN_HOLES.size).toBe(0)
  })
})

describe('markup slot membership: initial render agrees with the reactive claim (#2795 §5)', () => {
  /**
   * `<!--bf:ID-->${escapeTextOrMarkup(...)}` in the static template ⇔ a
   * `lazySlots(__scope, [{ id: 'ID', kind: 'markup' }])` claim in init — the
   * two sides of `markupSlotIdsOf`. Component-scope claims only: loop rows
   * and regions claim against their own row element.
   */
  function slotSets(clientJs: string): { template: Set<string>; claims: Set<string> } {
    const sf = ts.createSourceFile('client.js', clientJs, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const template = new Set<string>()
    const claims = new Set<string>()
    const visit = (n: ts.Node): void => {
      if (ts.isTemplateExpression(n)) {
        let preceding = n.head.text
        for (const span of n.templateSpans) {
          // Slot ids may carry the `^` JSX-prop prefix (`header={<b/>}`).
          const m = /<!--bf:([\^\w]+)-->$/.exec(preceding)
          const e = strip(span.expression)
          if (m && ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'escapeTextOrMarkup') template.add(m[1])
          preceding = span.literal.text
        }
      }
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'lazySlots') {
        const [scope, plan] = n.arguments
        if (scope && ts.isIdentifier(scope) && scope.text === '__scope' && plan && ts.isArrayLiteralExpression(plan)) {
          for (const el of plan.elements) {
            if (!ts.isObjectLiteralExpression(el)) continue
            let id: string | undefined
            let kind: string | undefined
            for (const p of el.properties) {
              if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name) || !ts.isStringLiteral(p.initializer)) continue
              if (p.name.text === 'id') id = p.initializer.text
              if (p.name.text === 'kind') kind = p.initializer.text
            }
            if (id && kind === 'markup') claims.add(id)
          }
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
    return { template, claims }
  }

  for (const shape of shapes) {
    test(shape.id, () => {
      const { clientJs, hasBfError } = compileShape(shape)
      if (hasBfError) return
      const { template, claims } = slotSets(clientJs)
      expect([...template].sort()).toEqual([...claims].sort())
    })
  }
})

describe('emitter structure pins (#2795 §4.3)', () => {
  const emitterDir = join(import.meta.dir, '..', 'ir-to-client-js')
  const count = (file: string, needle: string): number => readFileSync(join(emitterDir, file), 'utf8').split(needle).length - 1

  test('html-template.ts writes no child-position hole by hand — only the attribute-side ones remain', () => {
    // 4 in `templateAttrExpr` (boolean / style / data-key / general attr)
    // + 4 `${spreadAttrs(...)}` sites. Every other hole goes through
    // `interp(...)` in `safe-html.ts`. Exact, not "at most": a lower count
    // is progress and the pin should follow it down.
    expect(count('html-template.ts', '\\${')).toBe(8)
    // `itemAnchorTemplate` builds its `${KEY}` by concatenation — the one
    // hole the substring above cannot see (see `loop-item-anchor-key`).
    expect(count('html-template.ts', "'${' +")).toBe(1)
  })

  test('safe-html.ts has exactly one `${` — the `interp` door', () => {
    expect(count('safe-html.ts', '\\${')).toBe(1)
  })
})
