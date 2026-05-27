import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../index'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/index'

function compileClientJs(source: string): string {
  const result = compileJSX(source, 'test.tsx', { adapter: new HonoAdapter() })
  const clientJs = result.files.find(f => f.type === 'clientJs')
  if (!clientJs) throw new Error('No client JS emitted')
  return clientJs.content
}

describe('prop substitution in reactive attr expressions', () => {
  test('does NOT replace prop name inside double-quoted strings in class attr', () => {
    const source = `
"use client"
const sizeClasses: Record<string, string> = { default: "h-9", icon: "size-9" }
function Comp({ size = 'default' }: { size?: string }) {
  return <div className={\`base \${sizeClasses[size]}\`} />
}
export { Comp }
`
    const js = compileClientJs(source)
    expect(js).toContain('"size-9"')
    expect(js).not.toContain('(_p.size ?? \'default\')-9')
  })

  test('does NOT replace prop name in CSS selector strings', () => {
    const source = `
"use client"
function Comp({ size = 'default' }: { size?: string }) {
  return <button className={\`[&_svg:not([class*="size-"])]:size-4 \${size}\`} />
}
export { Comp }
`
    const js = compileClientJs(source)
    expect(js).toContain('[class*="size-"]')
    expect(js).toContain(':size-4')
  })

  test('rewrites prop name in interpolation positions', () => {
    const source = `
"use client"
function Comp({ size = 'default' }: { size?: string }) {
  return <div className={\`cls-\${size}\`} />
}
export { Comp }
`
    const js = compileClientJs(source)
    expect(js).toContain('_p.size')
  })

  test('Button-like pattern: CSS selectors, variant maps, and prop refs', () => {
    const source = `
"use client"
const base = 'inline-flex [&_svg:not([class*="size-"])]:size-4'
const variants: Record<string, string> = { default: "bg-primary", outline: "border" }
const sizes: Record<string, string> = { default: "h-9", icon: "size-9", "icon-sm": "size-8" }
function Btn({ variant = 'default', size = 'default', className = '' }: { variant?: string, size?: string, className?: string }) {
  return <button className={\`\${base} \${variants[variant]} \${sizes[size]} \${className}\`} />
}
export { Btn }
`
    const js = compileClientJs(source)
    expect(js).toContain('[class*="size-"]')
    expect(js).toContain(':size-4')
    expect(js).toContain('"size-9"')
    expect(js).toContain('"size-8"')
    expect(js).toContain('_p.variant')
    expect(js).toContain('_p.size')
    expect(js).toContain('_p.className')
    expect(js).not.toMatch(/\(_p\.size[^)]*\)-[0-9]/)
  })
})
