/**
 * Assemble ./public/ for Cloudflare Workers Assets.
 *
 * Mirrors the URL layout the Worker serves so `env.ASSETS.fetch(request)`
 * resolves directly:
 *   /integrations/h3/static/components/*  ← dist/static/components/* (Vite's build.outDir)
 *   /integrations/h3/shared/styles/*      ← ../shared/styles/*
 *
 * `dist/static/components` (NOT `dist/components`, which is
 * `vite.config.ts`'s `templates` dir — the SSR files import via
 * `tsconfig.json`'s `@/components/*` alias, never served to the browser) is
 * Vite's `build.outDir`: the content-hashed client bundles the browser
 * actually loads. Vite nests output under its own `assets/` subdirectory by
 * default, so this copies recursively rather than a flat, one-level copy.
 */

import { cp, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const BASE = process.env.BASE_PATH ?? '/integrations/h3'
const PUBLIC_DIR = join(ROOT, 'public')

await rm(PUBLIC_DIR, { recursive: true, force: true })

await mkdir(join(PUBLIC_DIR, `${BASE}/static/components`), { recursive: true })
await cp(join(ROOT, 'dist/static/components'), join(PUBLIC_DIR, `${BASE}/static/components`), { recursive: true })

await mkdir(join(PUBLIC_DIR, `${BASE}/shared/styles`), { recursive: true })
await cp(join(ROOT, '../shared/styles'), join(PUBLIC_DIR, `${BASE}/shared/styles`), { recursive: true })

console.log(`Assembled ./public${BASE}/`)
