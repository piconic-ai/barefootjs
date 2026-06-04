/**
 * Unit tests for the playground tool-calling agent's pure layer — the parts
 * that run in-Worker with no Workers AI binding: the embedded-knowledge tools,
 * the tool-call normalization (the load-bearing contract that lets the model's
 * tool calls round-trip back into the API), the result reader, and the message
 * assembly. The live model round-trip is exercised manually against `env.AI`
 * (see the agent.ts header); these tests pin the deterministic in-Worker logic.
 *
 * Run: `bun test site/playground/agent.test.ts`
 */

import { describe, expect, test } from 'bun:test'
import {
  TOOLS,
  SYSTEM_PROMPT,
  buildMessages,
  __testing,
} from './agent'

const {
  runTool,
  normalizeToolCalls,
  readResult,
  parseFileBlocks,
  validateFile,
  validateReply,
  buildRepairMessage,
  compactDocs,
} = __testing

describe('tool definitions', () => {
  test('exposes exactly the four lookup tools', () => {
    expect(TOOLS.map((t) => t.function.name).sort()).toEqual([
      'barefoot_guide',
      'get_component_docs',
      'hono_docs',
      'search_components',
    ])
  })
})

describe('search_components', () => {
  test('returns matching exposed components with import paths', () => {
    const out = JSON.parse(runTool('search_components', { query: 'button' }))
    const names = out.components.map((c: { name: string }) => c.name)
    expect(names).toContain('button')
    const btn = out.components.find((c: { name: string }) => c.name === 'button')
    expect(btn.importPath).toBe('@/components/ui/button')
  })

  test('empty query returns the full exposed set (never empty)', () => {
    const out = JSON.parse(runTool('search_components', { query: '' }))
    expect(out.components.length).toBeGreaterThan(0)
  })
})

describe('get_component_docs', () => {
  test('returns props + variants + import path for a known component', () => {
    const out = JSON.parse(runTool('get_component_docs', { name: 'button' }))
    expect(out.importPath).toBe('@/components/ui/button')
    expect(out.variants.ButtonVariant).toContain('outline')
    // The model must never invent a variant — the docs are the source of truth.
    expect(out.variants.ButtonVariant).not.toContain('primary')
  })

  test('Card reports its compound exports', () => {
    const out = JSON.parse(runTool('get_component_docs', { name: 'card' }))
    expect(out.exports).toContain('CardHeader')
    expect(out.exports).toContain('CardFooter')
  })

  test('unknown component returns an error naming the available set', () => {
    const out = JSON.parse(runTool('get_component_docs', { name: 'dialog' }))
    expect(out.error).toContain('Unknown component')
    expect(out.error).toContain('button')
  })
})

describe('barefoot_guide', () => {
  test('exact topic returns the guide text', () => {
    expect(runTool('barefoot_guide', { topic: 'error-codes' })).toContain('BF001')
  })

  test('fuzzy topic resolves (signals → create-signal)', () => {
    expect(runTool('barefoot_guide', { topic: 'signals' })).toContain('createSignal')
  })

  test('unknown topic lists the available topics', () => {
    const out = runTool('barefoot_guide', { topic: 'nonsense-xyz' })
    expect(out).toContain('Unknown topic')
    expect(out).toContain('reactivity')
  })
})

describe('hono_docs', () => {
  test('returns the server.tsx routing cheatsheet', () => {
    const out = runTool('hono_docs', {})
    expect(out).toContain('app.use(renderer)')
    expect(out).toContain('c.render')
  })
})

describe('normalizeToolCalls', () => {
  test('normalizes the native Workers AI shape ({name, arguments})', () => {
    const out = normalizeToolCalls([
      { name: 'get_component_docs', arguments: { name: 'button' } },
    ])
    expect(out[0].type).toBe('function')
    expect(out[0].function.name).toBe('get_component_docs')
    // arguments must be a STRING (the API validator requires it on echo-back).
    expect(out[0].function.arguments).toBe('{"name":"button"}')
    expect(out[0].id).toBeTruthy()
  })

  test('normalizes the OpenAI shape ({id, type, function})', () => {
    const out = normalizeToolCalls([
      {
        id: 'call_42',
        type: 'function',
        function: { name: 'hono_docs', arguments: '{}' },
      },
    ])
    expect(out[0].id).toBe('call_42')
    expect(out[0].function.name).toBe('hono_docs')
    expect(out[0].function.arguments).toBe('{}')
  })

  test('empty/undefined yields no calls', () => {
    expect(normalizeToolCalls(undefined)).toEqual([])
    expect(normalizeToolCalls([])).toEqual([])
  })
})

describe('readResult', () => {
  test('reads the native shape (response + tool_calls)', () => {
    const r = readResult({
      response: null,
      tool_calls: [{ name: 'hono_docs', arguments: {} }],
    })
    expect(r.toolCalls).toHaveLength(1)
    expect(r.toolCalls[0].function.name).toBe('hono_docs')
  })

  test('reads the OpenAI shape (choices[].message)', () => {
    const r = readResult({
      choices: [{ message: { content: 'done', tool_calls: [] } }],
    })
    expect(r.content).toBe('done')
    expect(r.toolCalls).toEqual([])
  })
})

describe('buildMessages', () => {
  test('system prompt + files block + history, in order', () => {
    const roles = buildMessages({
      messages: [{ role: 'user', content: 'hi' }],
      files: [{ path: 'server.tsx', content: 'x' }],
    }).map((m) => m.role)
    expect(roles).toEqual(['system', 'system', 'user'])
  })

  test('system prompt is markedly shorter than the legacy baked prompt', () => {
    // The legacy single-shot prompt was ~11.6k chars; the tool-calling prompt
    // moves the per-component docs / registry list into tools, but keeps the
    // concise correctness rules + the semantic-theme STYLE block inline (the
    // cheap, high-value fix for variant/styling drift).
    expect(SYSTEM_PROMPT.length).toBeLessThan(6000)
    expect(SYSTEM_PROMPT).toContain('USE THE TOOLS')
  })

  test('prompt carries the semantic-theme style guidance (fixes drift)', () => {
    // The model must steer toward theme tokens, away from random colors.
    expect(SYSTEM_PROMPT).toContain('text-muted-foreground')
    expect(SYSTEM_PROMPT).toContain('bg-card')
    expect(SYSTEM_PROMPT).toMatch(/bg-blue-500/) // named as a thing NOT to do
  })
})

describe('parseFileBlocks', () => {
  test('extracts path + content from each fenced tsx block', () => {
    const reply = [
      'Here you go.',
      '```tsx path="src/A.tsx"',
      'export function A() { return <div/> }',
      '```',
      'and',
      "```tsx path='server.tsx'",
      'export default app',
      '```',
    ].join('\n')
    const blocks = parseFileBlocks(reply)
    expect(blocks.map((b) => b.path)).toEqual(['src/A.tsx', 'server.tsx'])
    expect(blocks[0].content).toContain('function A')
  })

  test('returns empty for prose-only replies', () => {
    expect(parseFileBlocks('no code here')).toEqual([])
  })
})

describe('validateFile — registry usage', () => {
  test('flags an invented Button variant', () => {
    const issues = validateFile({
      path: 'src/Hero.tsx',
      content:
        "import { Button } from '@/components/ui/button'\nexport function Hero() { return <Button variant=\"primary\">Go</Button> }",
    })
    const msg = issues.map((i) => i.message).join('\n')
    expect(msg).toContain('variant="primary"')
    expect(msg).toContain('"default"') // names the valid options
  })

  test('accepts a valid variant + size', () => {
    const issues = validateFile({
      path: 'src/Hero.tsx',
      content:
        "import { Button } from '@/components/ui/button'\nexport function Hero() { return <Button variant=\"outline\" size=\"lg\">Go</Button> }",
    })
    expect(issues).toEqual([])
  })

  test('flags a missing import for a used component', () => {
    const issues = validateFile({
      path: 'src/Hero.tsx',
      content: 'export function Hero() { return <Badge>New</Badge> }',
    })
    expect(issues.some((i) => i.message.includes("@/components/ui/badge"))).toBe(true)
  })

  test('flags an import of an unavailable component', () => {
    const issues = validateFile({
      path: 'src/Hero.tsx',
      content:
        "import { Dialog } from '@/components/ui/dialog'\nexport function Hero() { return <div/> }",
    })
    expect(issues.some((i) => i.message.includes('not an available component'))).toBe(true)
  })

  test('flags <Input type="textarea"> (not a real input type)', () => {
    const issues = validateFile({
      path: 'src/Form.tsx',
      content:
        "import { Input } from '@/components/ui/input'\nexport function Form() { return <Input type=\"textarea\" /> }",
    })
    expect(issues.some((i) => i.message.includes('not a valid input type'))).toBe(true)
  })

  test('accepts <Input type="email">', () => {
    const issues = validateFile({
      path: 'src/Form.tsx',
      content:
        "import { Input } from '@/components/ui/input'\nexport function Form() { return <Input type=\"email\" /> }",
    })
    expect(issues).toEqual([])
  })

  test('does not flag dynamic {expr} variant values', () => {
    const issues = validateFile({
      path: 'src/Hero.tsx',
      content:
        "import { Button } from '@/components/ui/button'\nexport function Hero(props: { v: string }) { return <Button variant={props.v}>Go</Button> }",
    })
    expect(issues).toEqual([])
  })

  test('flags server.tsx with a named export instead of default', () => {
    const issues = validateFile({
      path: 'server.tsx',
      content:
        "import { Hono } from 'hono'\nimport { renderer } from './renderer'\nconst app = new Hono()\napp.use(renderer)\nexport { app }",
    })
    expect(issues.some((i) => i.message.includes('export default app'))).toBe(true)
  })

  test('flags server.tsx missing app.use(renderer)', () => {
    const issues = validateFile({
      path: 'server.tsx',
      content:
        "import { Hono } from 'hono'\nconst app = new Hono()\napp.get('/', (c) => c.render(<Home/>))\nexport default app",
    })
    expect(issues.some((i) => i.message.includes('app.use(renderer)'))).toBe(true)
  })

  test('accepts a well-formed server.tsx', () => {
    const issues = validateFile({
      path: 'server.tsx',
      content:
        "import { Hono } from 'hono'\nimport { renderer } from './renderer'\nimport { Home } from './src/Home'\nconst app = new Hono()\napp.use(renderer)\napp.get('/', (c) => c.render(<Home/>))\nexport default app",
    })
    expect(issues).toEqual([])
  })

  test('Card (compound) is satisfied by importing card', () => {
    const issues = validateFile({
      path: 'src/Panel.tsx',
      content:
        "import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'\nexport function Panel() { return <Card><CardHeader><CardTitle>Hi</CardTitle></CardHeader><CardContent>x</CardContent></Card> }",
    })
    expect(issues).toEqual([])
  })
})

describe('validateReply + buildRepairMessage', () => {
  test('validateReply aggregates issues across file blocks', () => {
    const reply = [
      '```tsx path="src/A.tsx"',
      "import { Button } from '@/components/ui/button'",
      'export function A() { return <Button variant="primary">x</Button> }',
      '```',
    ].join('\n')
    const issues = validateReply(reply)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].path).toBe('src/A.tsx')
  })

  test('repair message lists the issue and the authoritative options', () => {
    const reply = [
      '```tsx path="src/A.tsx"',
      "import { Button } from '@/components/ui/button'",
      'export function A() { return <Button variant="primary">x</Button> }',
      '```',
    ].join('\n')
    const issues = validateReply(reply)
    const msg = buildRepairMessage(issues, reply)
    expect(msg).toContain('src/A.tsx')
    expect(msg).toContain('variant="primary"')
    // Authoritative docs are re-attached (the real variant set).
    expect(msg).toContain('"destructive"')
  })
})

describe('compactDocs', () => {
  test('summarizes import line + variant options', () => {
    const d = compactDocs('button')
    expect(d).toContain("from '@/components/ui/button'")
    expect(d).toContain('"outline"')
    expect(d).not.toContain('"primary"')
  })
})
