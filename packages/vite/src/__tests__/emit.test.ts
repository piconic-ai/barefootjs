import { describe, test, expect, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CompileResult, TemplateAdapter } from '@barefootjs/jsx'
import { planEmits, writeEmits } from '../emit.ts'

const fakeAdapter = { extension: '.tmpl', templatesPerComponent: false } as TemplateAdapter
const perComponentAdapter = { extension: '.tmpl', templatesPerComponent: true } as TemplateAdapter

describe('planEmits', () => {
  test('plans a markedTemplate + ssrDefaults + types output, mirroring source position', () => {
    const result: CompileResult = {
      files: [
        { path: '/src/components/ui/button/index.html', content: '<button/>', type: 'markedTemplate' },
        { path: '/src/components/ui/button/index.ssr-defaults.json', content: '{}', type: 'ssrDefaults' },
        { path: '/src/components/ui/button/index.types', content: 'type ButtonProps struct{}', type: 'types' },
      ],
      errors: [],
    }

    const targets = planEmits(result, '/src/components/ui/button/index.tsx', ['/src/components'], fakeAdapter)
    const byPath = Object.fromEntries(targets.map(t => [t.relPath, t.content]))

    expect(byPath['ui/button/index.tmpl']).toBe('<button/>')
    expect(byPath['ui/button/index.ssr-defaults.json']).toBe('{}')
    expect(byPath['ui/button/index.types']).toBe('type ButtonProps struct{}')
  })

  test('names per-component templates after the component, for templatesPerComponent adapters', () => {
    const result: CompileResult = {
      files: [
        { path: '/x', content: 'toast body', type: 'markedTemplate', componentName: 'Toast' },
        { path: '/x', content: 'toaster body', type: 'markedTemplate', componentName: 'Toaster' },
      ],
      errors: [],
    }

    const targets = planEmits(result, '/src/components/ui/toast/index.tsx', ['/src/components'], perComponentAdapter)
    const byPath = Object.fromEntries(targets.map(t => [t.relPath, t.content]))

    expect(byPath['ui/toast/Toast.tmpl']).toBe('toast body')
    expect(byPath['ui/toast/Toaster.tmpl']).toBe('toaster body')
  })

  test('plans nothing for a state-only compile with no markedTemplate output', () => {
    const result: CompileResult = {
      files: [{ path: '/x', content: 'export const x = 1', type: 'clientJs' }],
      errors: [],
    }
    const targets = planEmits(result, '/src/components/state.tsx', ['/src/components'], fakeAdapter)
    expect(targets).toEqual([])
  })
})

describe('writeEmits', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('creates nested directories and writes every target', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-emit-'))
    await writeEmits(dir, [
      { relPath: 'ui/button/index.tmpl', content: '<button/>' },
      { relPath: 'top.tmpl', content: 'top' },
    ])

    expect(await readFile(join(dir, 'ui/button/index.tmpl'), 'utf8')).toBe('<button/>')
    expect(await readFile(join(dir, 'top.tmpl'), 'utf8')).toBe('top')
  })
})
