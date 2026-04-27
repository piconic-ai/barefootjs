/**
 * Watch component sources and re-run build.ts on change.
 *
 * Pair with `bun run dev` (which only watches server.tsx and its imports).
 * The dev server reads `dist/components/*.tsx` via the `@/*` alias, so dist
 * has to be kept fresh as sources change. build.ts (without --clean) writes
 * incrementally so the dev server never sees a missing module mid-rebuild.
 */

import { watch, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'

const ROOT_DIR = dirname(import.meta.path)

const SOURCE_DIRS = [
  resolve(ROOT_DIR, 'components'),
  resolve(ROOT_DIR, '../../ui/components'),
  resolve(ROOT_DIR, '../shared/components'),
  resolve(ROOT_DIR, 'styles'),
]

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isDirectory()
  } catch {
    return false
  }
}

const DEBOUNCE_MS = 150

let running = false
let pending = false
let timer: ReturnType<typeof setTimeout> | null = null

function schedule() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(flush, DEBOUNCE_MS)
}

function flush() {
  timer = null
  if (running) {
    pending = true
    return
  }
  runBuild()
}

function runBuild() {
  running = true
  const t0 = performance.now()
  const proc = spawn('bun', ['run', 'build.ts'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  })
  proc.on('exit', (code) => {
    const ms = (performance.now() - t0).toFixed(0)
    if (code === 0) {
      console.log(`\n[build:watch] rebuild ok (${ms}ms)\n`)
    } else {
      console.error(`\n[build:watch] rebuild failed with code ${code} (${ms}ms)\n`)
    }
    running = false
    if (pending) {
      pending = false
      runBuild()
    }
  })
}

const isRelevant = (filename: string | null): boolean => {
  if (!filename) return false
  return (
    filename.endsWith('.tsx') ||
    filename.endsWith('.ts') ||
    filename.endsWith('.css') ||
    filename.endsWith('.json')
  )
}

async function watchDir(dir: string) {
  try {
    for await (const event of watch(dir, { recursive: true })) {
      if (!isRelevant(event.filename)) continue
      schedule()
    }
  } catch (err) {
    console.warn(`[build:watch] watcher for ${dir} stopped: ${(err as Error).message}`)
  }
}

console.log('[build:watch] running initial build...')
runBuild()

const dirsToWatch: string[] = []
for (const dir of SOURCE_DIRS) {
  if (await dirExists(dir)) {
    dirsToWatch.push(dir)
  } else {
    console.log(`[build:watch] skipping (not found): ${dir}`)
  }
}
console.log(`[build:watch] watching ${dirsToWatch.length} source dirs (.tsx/.ts/.css/.json)`)

await Promise.all(dirsToWatch.map(watchDir))
