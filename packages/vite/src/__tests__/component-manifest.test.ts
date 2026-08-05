/**
 * Coverage of `buildManifestEntry` — the combined `manifest.json` row
 * builder (see `component-manifest.ts`'s header for the fields
 * intentionally not included).
 */
import { describe, test, expect } from 'bun:test'
import type { CompileResult, TemplateAdapter } from '@barefootjs/jsx'
import { buildManifestEntry } from '../component-manifest.ts'

const fakeAdapter = { extension: '.tmpl', templatesPerComponent: false } as TemplateAdapter
const perComponentAdapter = { extension: '.tmpl', templatesPerComponent: true } as TemplateAdapter

describe('buildManifestEntry', () => {
  test('single-component, non-templatesPerComponent, no ssrDefaults: absent key, no components map', () => {
    const result: CompileResult = {
      files: [{ path: '/x', content: '<button/>', type: 'markedTemplate', componentName: 'Counter' }],
      errors: [],
    }

    const row = buildManifestEntry(result, '/src/components/Counter.tsx', ['/src/components'], fakeAdapter)

    expect(row).not.toBeNull()
    expect(row!.manifestKey).toBe('Counter')
    expect(row!.entry).toEqual({ markedTemplate: 'Counter.tmpl' })
    // The absent-key contract matters: a consumer checking
    // `'ssrDefaults' in entry` (or PHP's `array_key_exists`) must see FALSE
    // for a component with no SSR defaults, not an empty object — see the
    // `...(ssrDefaults ? { ssrDefaults } : {})` spread in
    // `buildManifestEntry`.
    expect('ssrDefaults' in row!.entry).toBe(false)
    expect('components' in row!.entry).toBe(false)
  })

  test('single-component, non-templatesPerComponent, WITH ssrDefaults', () => {
    const result: CompileResult = {
      files: [
        { path: '/x', content: '<button/>', type: 'markedTemplate', componentName: 'Counter' },
        { path: '/x', content: '{"initial":{"propName":"initial","value":0}}', type: 'ssrDefaults', componentName: 'Counter' },
      ],
      errors: [],
    }

    const row = buildManifestEntry(result, '/src/components/Counter.tsx', ['/src/components'], fakeAdapter)

    expect(row!.entry).toEqual({
      markedTemplate: 'Counter.tmpl',
      ssrDefaults: { initial: { propName: 'initial', value: 0 } },
    })
  })

  test('templatesPerComponent adapter, single component: top-level fields mirror the components sub-map', () => {
    const result: CompileResult = {
      files: [
        { path: '/x', content: 'body', type: 'markedTemplate', componentName: 'Counter' },
        { path: '/x', content: '{"initial":{"value":0}}', type: 'ssrDefaults', componentName: 'Counter' },
      ],
      errors: [],
    }

    const row = buildManifestEntry(result, '/src/components/Counter.tsx', ['/src/components'], perComponentAdapter)

    expect(row!.manifestKey).toBe('Counter')
    expect(row!.entry).toEqual({
      markedTemplate: 'Counter.tmpl',
      ssrDefaults: { initial: { value: 0 } },
      components: {
        Counter: { markedTemplate: 'Counter.tmpl', ssrDefaults: { initial: { value: 0 } } },
      },
    })
  })

  test('templatesPerComponent adapter, multi-export file: one manifestKey, per-component rows, partial ssrDefaults', () => {
    const result: CompileResult = {
      files: [
        { path: '/x', content: 'toast body', type: 'markedTemplate', componentName: 'Toast' },
        { path: '/x', content: 'toaster body', type: 'markedTemplate', componentName: 'Toaster' },
        { path: '/x', content: '{"open":{"value":false}}', type: 'ssrDefaults', componentName: 'Toast' },
        // Toaster has no ssrDefaults file at all.
      ],
      errors: [],
    }

    const row = buildManifestEntry(
      result,
      '/src/components/ui/toast/index.tsx',
      ['/src/components'],
      perComponentAdapter,
    )

    // Neither exported component's name is 'index' (the file's own
    // basename), so `markedTemplates[0]` is used for a multi-export file
    // (see `component-manifest.ts`'s "Primary (top-level) template"
    // comment).
    expect(row!.manifestKey).toBe('ui/toast/index')
    expect(row!.entry.markedTemplate).toBe('ui/toast/Toast.tmpl')
    expect(row!.entry.ssrDefaults).toEqual({ open: { value: false } })
    expect(row!.entry.components).toEqual({
      Toast: { markedTemplate: 'ui/toast/Toast.tmpl', ssrDefaults: { open: { value: false } } },
      Toaster: { markedTemplate: 'ui/toast/Toaster.tmpl' },
    })
    expect('ssrDefaults' in row!.entry.components!.Toaster!).toBe(false)
  })

  test('returns null for a state-only compile with no markedTemplate output', () => {
    const result: CompileResult = {
      files: [{ path: '/x', content: 'export const x = 1', type: 'clientJs' }],
      errors: [],
    }
    expect(buildManifestEntry(result, '/src/components/state.tsx', ['/src/components'], fakeAdapter)).toBeNull()
  })

  test('drops malformed ssrDefaults content instead of throwing', () => {
    const result: CompileResult = {
      files: [
        { path: '/x', content: 'body', type: 'markedTemplate', componentName: 'Counter' },
        { path: '/x', content: 'not json', type: 'ssrDefaults', componentName: 'Counter' },
      ],
      errors: [],
    }

    const row = buildManifestEntry(result, '/src/components/Counter.tsx', ['/src/components'], fakeAdapter)
    expect('ssrDefaults' in row!.entry).toBe(false)
  })
})
