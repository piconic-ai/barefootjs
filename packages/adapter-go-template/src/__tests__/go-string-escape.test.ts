/**
 * Go's template lexer and Go source both reject a raw newline inside a
 * double-quoted string ("unterminated quoted string" / "newline in string").
 * A module const whose value holds a line break — a multiline template
 * literal or a `'\n'` escape — is inlined as a quoted literal into the
 * template and, for a baked static child loop, into the generated Go
 * constructor, so the quoting must spell control characters as escapes.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'
import { escapeGoString } from '../adapter/lib/go-emit'

function compile(source: string): { adapter: GoTemplateAdapter; ir: ComponentIR } {
  const adapter = new GoTemplateAdapter()
  const result = compileJSX(source.trimStart(), 'test.tsx', { adapter, outputIR: true })
  const irs = result.files.filter(f => f.type === 'ir').map(f => JSON.parse(f.content) as ComponentIR)
  const ir = irs.find(i => i.metadata.componentName === 'C')
  if (!ir) throw new Error('No IR output for C')
  return { adapter, ir }
}

describe('escapeGoString', () => {
  test('spells line breaks, tabs and other control characters as escapes', () => {
    expect(escapeGoString('before\nafter')).toBe('before\\nafter')
    expect(escapeGoString('a\tb\r\nc')).toBe('a\\tb\\r\\nc')
    expect(escapeGoString('\x00\x01\x1f\x7f')).toBe('\\x00\\x01\\x1f\\x7f')
  })

  test('keeps the backslash and double-quote escapes and leaves other text alone', () => {
    expect(escapeGoString('say "hi" \\ bye')).toBe('say \\"hi\\" \\\\ bye')
    expect(escapeGoString('é → ✓  ')).toBe('é → ✓  ')
  })

  test('agrees with JSON string escaping wherever both define a short escape', () => {
    const value = 'a\nb\tc\rd"e\\f'
    expect(`"${escapeGoString(value)}"`).toBe(JSON.stringify(value))
  })
})

describe('module string const with a line break', () => {
  test('is inlined as an escaped Go template literal in text, attribute and concatenation', () => {
    const { adapter, ir } = compile(`
const text = \`before
after\`
export function C({ on }: { on: boolean }) {
  return <p data-t={\`\${text}!\`}>{text}{on ? text : 'none'}<b>{text + '|'}</b></p>
}
`)
    const template = adapter.generate(ir).template
    expect(template).toContain('"before\\nafter"')
    expect(template).not.toContain('before\nafter')
  })

  test('is baked into a static child loop constructor as an escaped Go string', () => {
    const { adapter, ir } = compile(`
const ROWS = ['q1\\nq2', 'w']
function Label({ value }: { value: string }) {
  return <i>{value}</i>
}
export function C() {
  return <ul>{ROWS.map(r => <Label key={r} value={r} />)}</ul>
}
`)
    const types = adapter.generateTypes(ir)!
    expect(types).toContain('Value: "q1\\nq2"')
    expect(types).not.toContain('q1\nq2')
  })
})
