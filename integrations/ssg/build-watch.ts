#!/usr/bin/env bun
//
// `vite build --watch` alone only regenerates dist/assets/* and manifest.json.
// public/*.html (written by toSSG) never follows that regeneration on its own, so
// every component edit needs "Vite rebuild -> generateSite (re-resolve manifest +
// re-run toSSG)" done as one unit. Listening for the Rollup watcher's 'END' event
// (which also fires once the initial build completes) gets this without pulling
// in an extra dependency like chokidar.
import { resolve } from 'node:path'
import { build as viteBuild } from 'vite'
import type { RollupWatcher } from 'rollup'
import { generateSite } from './scripts/generate-site.tsx'
import { BASE_PATH, OUT_DIR } from './constants.ts'

const ROOT = import.meta.dirname
const ABS_OUT_DIR = resolve(ROOT, OUT_DIR)

const watcher = (await viteBuild({
  configFile: resolve(ROOT, 'vite.config.ts'),
  build: { watch: {} },
})) as RollupWatcher

watcher.on('event', async (event) => {
  if (event.code === 'BUNDLE_END') event.result.close()
  if (event.code === 'ERROR') {
    console.error('[ssg build:watch] vite build error:', event.error)
    return
  }
  if (event.code !== 'END') return
  try {
    await generateSite({ projectDir: ROOT, outDir: ABS_OUT_DIR, basePath: BASE_PATH })
  } catch (err) {
    console.error('[ssg build:watch] generateSite failed:', err)
  }
})
