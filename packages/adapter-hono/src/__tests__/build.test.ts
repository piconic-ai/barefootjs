import { describe, test, expect } from 'bun:test'
import { addScriptCollection, createConfig } from '../build'

// ── addScriptCollection ──────────────────────────────────────────────

describe('addScriptCollection', () => {
  test('injects imports and script collector into exported function', () => {
    const input = `import { jsx } from 'hono/jsx'

export function Counter(props: CounterProps) {
  return (<div>hello</div>)
}`

    const result = addScriptCollection(input, 'Counter', 'Counter.client.js')

    expect(result).toContain("import { useRequestContext } from 'hono/jsx-renderer'")
    expect(result).toContain("import { Fragment } from 'hono/jsx'")
    expect(result).toContain('__bfWrap')
    expect(result).toContain('bfCollectedScripts')
    expect(result).toContain("'Counter'")
    expect(result).toContain('Counter.client.js')
  })

  test('preserves content when no import match', () => {
    const input = 'const x = 1'
    // Should not throw, returns unchanged or minimally modified
    const result = addScriptCollection(input, 'Test', 'Test.client.js')
    expect(result).toBeDefined()
  })

  test('uses custom scriptBasePath', () => {
    const input = `import { jsx } from 'hono/jsx'

export function Counter() {
  return (<div>hello</div>)
}`

    const result = addScriptCollection(input, 'Counter', 'Counter.client.js', '/assets/js/')
    expect(result).toContain('/assets/js/barefoot.js')
    expect(result).toContain('/assets/js/Counter.client.js')
    expect(result).not.toContain('/static/components/')
  })

  test('normalizes scriptBasePath without trailing slash', () => {
    const input = `import { jsx } from 'hono/jsx'

export function Counter() {
  return (<div>hello</div>)
}`

    const result = addScriptCollection(input, 'Counter', 'Counter.client.js', '/assets/js')
    expect(result).toContain('/assets/js/barefoot.js')
    expect(result).toContain('/assets/js/Counter.client.js')
  })

  test('handles destructured params with arrow function defaults', () => {
    const input = `import { jsx } from 'hono/jsx'

export function Textarea({ className = '', onInput = () => {}, onChange = () => {}, ...props }: TextareaProps) {
  return (<textarea class={className} {...props} />)
}`

    const result = addScriptCollection(input, 'textarea', 'textarea-abc123.js')

    // Script collector must be inside the Textarea function body, NOT inside a default param
    expect(result).toContain('__bfInlineScripts')
    expect(result).toContain('__bfWrap')

    // Verify __bfInlineScripts is declared AFTER the function opening brace,
    // not inside an arrow function default value
    const funcBodyMatch = result.match(/\.\.\.props\s*\}\s*:\s*TextareaProps\)\s*\{/)
    expect(funcBodyMatch).not.toBeNull()
    // After the function body opening, the next thing should be the script collector
    if (funcBodyMatch) {
      const afterFuncBody = result.slice(result.indexOf(funcBodyMatch[0]) + funcBodyMatch[0].length)
      expect(afterFuncBody.trimStart().startsWith('let __bfInlineScripts')).toBe(true)
    }
  })
})

// ── createConfig() factory ──────────────────────────────────────────

describe('createConfig()', () => {
  test('creates config with HonoAdapter', () => {
    const config = createConfig()
    expect(config.adapter.name).toBe('hono')
  })

  test('sets transformMarkedTemplate by default', () => {
    const config = createConfig()
    expect(typeof config.transformMarkedTemplate).toBe('function')
  })

  test('disables transformMarkedTemplate when scriptCollection is false', () => {
    const config = createConfig({ scriptCollection: false })
    expect(config.transformMarkedTemplate).toBeUndefined()
  })

  test('uses custom scriptBasePath in transformMarkedTemplate', () => {
    const config = createConfig({ scriptBasePath: '/assets/js/' })
    const input = `import { jsx } from 'hono/jsx'

export function Counter() {
  return (<div>hello</div>)
}`
    const result = config.transformMarkedTemplate!(input, 'Counter', 'Counter.client.js')
    expect(result).toContain('/assets/js/barefoot.js')
    expect(result).toContain('/assets/js/Counter.client.js')
    expect(result).not.toContain('/static/components/')
  })

  test('uses default scriptBasePath in transformMarkedTemplate', () => {
    const config = createConfig()
    const input = `import { jsx } from 'hono/jsx'

export function Counter() {
  return (<div>hello</div>)
}`
    const result = config.transformMarkedTemplate!(input, 'Counter', 'Counter.client.js')
    expect(result).toContain('/static/components/barefoot.js')
    expect(result).toContain('/static/components/Counter.client.js')
  })

  test('passes through build options', () => {
    const config = createConfig({
      components: ['src'],
      outDir: 'build',
      minify: true,
      contentHash: true,
      clientOnly: true,
    })
    expect(config.components).toEqual(['src'])
    expect(config.outDir).toBe('build')
    expect(config.minify).toBe(true)
    expect(config.contentHash).toBe(true)
    expect(config.clientOnly).toBe(true)
  })

  test('passes through externals and externalsBasePath', () => {
    const externals = { react: { url: 'https://cdn.example.com/react.js' } }
    const config = createConfig({
      externals,
      externalsBasePath: '/cdn/',
    })
    expect(config.externals).toBe(externals)
    expect(config.externalsBasePath).toBe('/cdn/')
  })

  test('externals and externalsBasePath default to undefined', () => {
    const config = createConfig()
    expect(config.externals).toBeUndefined()
    expect(config.externalsBasePath).toBeUndefined()
  })
})
