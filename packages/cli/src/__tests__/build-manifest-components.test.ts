/**
 * Manifest `components` map for multi-component registry modules (#2132).
 *
 * `templatesPerComponent` adapters (Mojolicious) compile a registry module
 * that exports several components from one file — `ui/toast/index.tsx`
 * exporting ToastProvider / Toast / ToastTitle — into one template file PER
 * component, but the manifest entry used to carry a single `markedTemplate`
 * (the first component's). Server runtimes register child renderers from the
 * manifest, so `render_child('toast_provider')` found nothing and the whole
 * module 500'd on SSR.
 *
 * This pins the emitter side of the fix: each manifest entry for a
 * `templatesPerComponent` adapter carries a `components` map — one row per
 * exported component with its own `markedTemplate` + `ssrDefaults` — keyed by
 * the component name (NOT the template basename: a single-component file's
 * template is named after the source file, e.g. `index.html.ep`). The
 * consumer side lives in the Perl runtime
 * (`packages/adapter-perl/t/manifest_components.t`).
 */

import { describe, test, expect } from 'bun:test'
import { build } from '../lib/build'
import { MojoAdapter } from '../../../adapter-mojolicious/src/adapter/mojo-adapter'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, realpathSync, symlinkSync } from 'fs'
import { resolve } from 'path'
import { tmpdir } from 'os'

function makeTmpDir(label: string) {
  const dir = resolve(tmpdir(), `bf-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  return realpathSync(dir)
}

/**
 * Link the workspace `@barefootjs/client` into the throwaway project so the
 * build can copy `barefoot.js` — without it the compiled client bundles'
 * `../../barefoot.js` imports don't resolve on disk and the rebuild pass
 * raises BF053, which is noise unrelated to what this file pins.
 */
function linkClientRuntime(projectDir: string) {
  const scope = resolve(projectDir, 'node_modules/@barefootjs')
  mkdirSync(scope, { recursive: true })
  symlinkSync(resolve(import.meta.dir, '../../../client'), resolve(scope, 'client'))
}

// The registry-toast shape: one module, several exported components.
const TOAST_SOURCE = `'use client'

interface ToastProviderProps {
  children?: any
}

export function ToastProvider({ children }: ToastProviderProps) {
  return <div data-slot="toast-provider">{children}</div>
}

interface ToastProps {
  open?: boolean
  children?: any
}

export function Toast({ open = false, children }: ToastProps) {
  return (
    <div data-slot="toast" data-state={open ? 'open' : 'closed'}>
      {children}
    </div>
  )
}

export function ToastTitle({ children }: { children?: any }) {
  return <div data-slot="toast-title">{children}</div>
}
`

// Single-component module whose template is named after the SOURCE file
// (`index.html.ep`) — the component name must still key the map.
const TOASTER_SOURCE = `'use client'
import { createSignal } from '@barefootjs/client'

export function Toaster() {
  const [count, setCount] = createSignal(0)
  return <div data-slot="toaster" onClick={() => setCount(count() + 1)}>{count()}</div>
}
`

async function runBuild(projectDir: string, outDir: string) {
  return build({
    projectDir,
    adapter: new MojoAdapter(),
    componentDirs: [resolve(projectDir, 'components')],
    outDir,
    minify: false,
    contentHash: false,
    clientOnly: false,
    outputLayout: { templates: 'templates', clientJs: 'client', runtime: 'client' },
  })
}

describe('manifest `components` map for templatesPerComponent adapters (#2132)', () => {
  test('multi-component ui module lists one row per exported component', async () => {
    const projectDir = makeTmpDir('manifest-components-src')
    const outDir = makeTmpDir('manifest-components-out')
    try {
      const toastDir = resolve(projectDir, 'components/ui/toast')
      const toasterDir = resolve(projectDir, 'components/ui/toaster')
      mkdirSync(toastDir, { recursive: true })
      mkdirSync(toasterDir, { recursive: true })
      writeFileSync(resolve(toastDir, 'index.tsx'), TOAST_SOURCE)
      writeFileSync(resolve(toasterDir, 'index.tsx'), TOASTER_SOURCE)
      linkClientRuntime(projectDir)

      const result = await runBuild(projectDir, outDir)
      expect(result.errorCount).toBe(0)

      const entry = result.manifest['ui/toast/index']
      expect(entry).toBeDefined()
      expect(Object.keys(entry.components ?? {}).sort()).toEqual([
        'Toast',
        'ToastProvider',
        'ToastTitle',
      ])
      expect(entry.components!.ToastProvider.markedTemplate).toBe(
        'templates/ui/toast/ToastProvider.html.ep',
      )
      expect(entry.components!.Toast.markedTemplate).toBe('templates/ui/toast/Toast.html.ep')
      expect(entry.components!.ToastTitle.markedTemplate).toBe(
        'templates/ui/toast/ToastTitle.html.ep',
      )
      // Per-component ssrDefaults, not the module-primary's: Toast's `open`
      // destructure default must ride on Toast's own row so the runtime can
      // seed `$open` when the caller passes no prop.
      expect(entry.components!.Toast.ssrDefaults).toEqual({
        open: { propName: 'open', value: false },
        children: { propName: 'children', value: null },
      })
      // Every listed template exists on disk.
      for (const row of Object.values(entry.components!)) {
        expect(existsSync(resolve(outDir, row.markedTemplate))).toBe(true)
      }

      // The map key is the component name even when the single template is
      // named after the source file.
      const toaster = result.manifest['ui/toaster/index']
      expect(Object.keys(toaster.components ?? {})).toEqual(['Toaster'])
      expect(toaster.components!.Toaster.markedTemplate).toBe(
        'templates/ui/toaster/index.html.ep',
      )

      // The on-disk manifest carries the same rows.
      const onDisk = JSON.parse(
        readFileSync(resolve(outDir, 'templates/manifest.json'), 'utf-8'),
      )
      expect(onDisk['ui/toast/index'].components).toEqual(entry.components)
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('cache-hit rebuild restores the components map', async () => {
    const projectDir = makeTmpDir('manifest-components-cache-src')
    const outDir = makeTmpDir('manifest-components-cache-out')
    try {
      const toastDir = resolve(projectDir, 'components/ui/toast')
      mkdirSync(toastDir, { recursive: true })
      writeFileSync(resolve(toastDir, 'index.tsx'), TOAST_SOURCE)
      linkClientRuntime(projectDir)

      const first = await runBuild(projectDir, outDir)
      expect(first.errorCount).toBe(0)

      const second = await runBuild(projectDir, outDir)
      expect(second.errorCount).toBe(0)
      expect(second.cachedCount).toBeGreaterThan(0)
      expect(second.manifest['ui/toast/index'].components).toEqual(
        first.manifest['ui/toast/index'].components,
      )
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
