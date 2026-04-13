/**
 * Hono test renderer
 *
 * Compiles JSX source with HonoAdapter and renders to HTML via Hono's app.request().
 * Used by adapter-tests conformance runner.
 */

import { compileJSXSync } from '@barefootjs/jsx'
import type { TemplateAdapter } from '@barefootjs/jsx'
import { Hono } from 'hono'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

// Place temp files inside the hono package so hono/jsx resolves correctly
const RENDER_TEMP_DIR = resolve(import.meta.dir, '../.render-temp')

export interface RenderOptions {
  /** JSX source code */
  source: string
  /** Template adapter to use */
  adapter: TemplateAdapter
  /** Props to inject (optional) */
  props?: Record<string, unknown>
  /** Additional component files (filename → source) */
  components?: Record<string, string>
}

export async function renderHonoComponent(options: RenderOptions): Promise<string> {
  const { source, adapter, props, components } = options

  // Compile child components first
  const childCodes: string[] = []
  const componentKeys = new Set<string>()
  if (components) {
    for (const [filename, childSource] of Object.entries(components)) {
      componentKeys.add(filename)
      const childResult = compileJSXSync(childSource, filename, { adapter })
      const childErrors = childResult.errors.filter(e => e.severity === 'error')
      if (childErrors.length > 0) {
        throw new Error(`Compilation errors in ${filename}:\n${childErrors.map(e => e.message).join('\n')}`)
      }
      const childTemplate = childResult.files.find(f => f.type === 'markedTemplate')
      if (!childTemplate) throw new Error(`No marked template for ${filename}`)
      // Strip export keywords so only the parent component is exported
      const localCode = childTemplate.content.replace(/\bexport\s+(default\s+)?/g, '')
      childCodes.push(localCode)
    }
  }

  // Compile parent source
  const result = compileJSXSync(source, 'component.tsx', { adapter })

  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compilation errors:\n${errors.map(e => e.message).join('\n')}`)
  }

  const templateFile = result.files.find(f => f.type === 'markedTemplate')
  if (!templateFile) throw new Error('No marked template in compile output')

  let parentCode = templateFile.content
  // Strip import lines that reference component files
  if (componentKeys.size > 0) {
    parentCode = parentCode
      .split('\n')
      .filter(line => {
        const importMatch = line.match(/^\s*import\s+.*from\s+['"](.+?)['"]/)
        if (!importMatch) return true
        const importPath = importMatch[1]
        // Match against component keys: './badge' matches './badge.tsx'
        for (const key of componentKeys) {
          const keyWithoutExt = key.replace(/\.tsx?$/, '')
          if (importPath === keyWithoutExt || importPath === key) return false
        }
        return true
      })
      .join('\n')
  }

  // Combine: JSX pragma + child compiled functions + parent compiled code
  const codeParts = ['/** @jsxImportSource hono/jsx */']
  for (const childCode of childCodes) {
    codeParts.push(childCode)
  }
  codeParts.push(parentCode)
  const code = codeParts.join('\n')

  await mkdir(RENDER_TEMP_DIR, { recursive: true })
  // Unique filename per render to avoid Bun's process-level module cache
  // (bun#12371: re-importing the same path returns stale module)
  const tempFile = resolve(
    RENDER_TEMP_DIR,
    `render-${Date.now()}-${Math.random().toString(36).slice(2)}.tsx`,
  )
  await Bun.write(tempFile, code)

  try {
    const mod = await import(tempFile)

    // Find the exported component function
    const componentName = Object.keys(mod).find(k => typeof mod[k] === 'function')
    if (!componentName) throw new Error('No component function found in compiled module')

    const Component = mod[componentName]

    // Render using Hono's app.request()
    const app = new Hono()
    app.get('/', (c) =>
      c.html(Component({ __instanceId: 'test', __bfChild: false, ...props })),
    )

    const res = await app.request('/')
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Render failed with status ${res.status}: ${body}`)
    }
    return await res.text()
  } finally {
    await rm(tempFile, { force: true }).catch(() => {})
  }
}
