/**
 * Assemble ./public/ for Cloudflare Workers Assets.
 *
 * Mirrors the URL layout expected by the Worker:
 *   /integrations/hono/static/components/*  ← dist/components/*.{js,map}
 *   /integrations/hono/shared/styles/*      ← ../shared/styles/*
 */

import { readdir, mkdir, copyFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const BASE = '/integrations/hono'
const PUBLIC_DIR = join(ROOT, 'public')

async function copyDir(src: string, destRel: string, filter?: (name: string) => boolean) {
  const dest = join(PUBLIC_DIR, destRel)
  await mkdir(dest, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true })
  for (const e of entries) {
    if (!e.isFile()) continue
    if (filter && !filter(e.name)) continue
    await copyFile(join(src, e.name), join(dest, e.name))
  }
}

await rm(PUBLIC_DIR, { recursive: true, force: true })

await copyDir(
  join(ROOT, 'dist/components'),
  `${BASE}/static/components`,
  (name) => name.endsWith('.js') || name.endsWith('.map') || name === 'manifest.json',
)

await copyDir(
  join(ROOT, '../shared/styles'),
  `${BASE}/shared/styles`,
)

console.log(`Assembled ./public${BASE}/`)
