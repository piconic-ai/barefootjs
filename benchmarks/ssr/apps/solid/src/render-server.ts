/**
 * Server render entry for the Solid SSR bench — pure Bun, no browser.
 *
 * Solid's SSR story compiles ONE component source two ways (see App.tsx's
 * docstring). This module owns the server half: babel-transform App.tsx
 * with `generate: 'ssr', hydratable: true`, then call the compiled
 * function through `renderToString` from `solid-js/web`.
 *
 * Package resolution note: running this file directly under `bun run`
 * (unbundled — no Bun.build in the loop) resolves `solid-js/web`'s
 * `node` export condition by default, which is the real string-rendering
 * server build (`dist/server.js`, `isServer === true`) — verified during
 * implementation. That's different from the CLIENT bundle (build.ts),
 * which goes through `Bun.build({ conditions: ['browser', 'production'] })`
 * to force the DOM renderer instead.
 *
 * The babel transform + dynamic import happen once (memoized in
 * `ensureCompiled`); `renderPage` itself only calls the already-compiled
 * function, so the 20-iteration bench loop times pure render work, not
 * compilation — matching how a real server compiles once at boot and
 * renders per request.
 */
import { transformSync } from '@babel/core'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RowData } from './App.tsx'

const SRC = join(dirname(fileURLToPath(import.meta.url)), 'App.tsx')

interface CompiledSSR {
  App: (props: { initialRows: RowData[] }) => unknown
  renderToString: (fn: () => unknown) => string
  generateHydrationScript: () => string
}

let compiledPromise: Promise<CompiledSSR> | null = null

async function ensureCompiled(): Promise<CompiledSSR> {
  if (!compiledPromise) {
    compiledPromise = (async () => {
      const source = readFileSync(SRC, 'utf8')
      const result = transformSync(source, {
        filename: SRC,
        presets: [
          ['babel-preset-solid', { generate: 'ssr', hydratable: true }],
          ['@babel/preset-typescript', { isTSX: true, allExtensions: true }],
        ],
        babelrc: false,
        configFile: false,
      })
      if (!result?.code) throw new Error('solid ssr babel transform produced no code')

      // Unique filename per process avoids Bun's process-level module
      // cache returning a stale module on re-import (bun#12371), same
      // precaution as packages/adapter-hono/src/test-render.ts.
      const tmpFile = join(
        dirname(SRC),
        `.ssr-compiled-${Date.now()}-${Math.random().toString(36).slice(2)}.js`,
      )
      writeFileSync(tmpFile, result.code)
      try {
        const [mod, web] = await Promise.all([import(tmpFile), import('solid-js/web')])
        return {
          App: mod.App as CompiledSSR['App'],
          renderToString: web.renderToString,
          generateHydrationScript: web.generateHydrationScript,
        }
      } finally {
        unlinkSync(tmpFile)
      }
    })()
  }
  return compiledPromise
}

export async function renderPage(rows: RowData[]): Promise<string> {
  const { App, renderToString } = await ensureCompiled()
  return renderToString(() => App({ initialRows: rows }))
}

/** Head `<script>` Solid's hydration protocol requires — see App.tsx docstring. */
export async function hydrationScriptTag(): Promise<string> {
  const { generateHydrationScript } = await ensureCompiled()
  return generateHydrationScript()
}
