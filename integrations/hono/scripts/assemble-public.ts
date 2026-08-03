/**
 * Assemble ./public/ for Cloudflare Workers Assets.
 *
 * Mirrors the URL layout expected by the Worker:
 *   /integrations/hono/static/components/*  ← dist/static/components/* (Vite's build.outDir)
 *   /integrations/hono/shared/styles/*      ← ../shared/styles/*
 *
 * `dist/static/components` (NOT `dist/components`, which is
 * `vite.config.ts`'s `templates` dir — the SSR `.tsx` sources
 * `server.tsx`/`blog.tsx` import via `tsconfig.json`'s `@/components/*`
 * alias, never served to the browser) is Vite's `build.outDir`: the
 * content-hashed client bundles the browser actually loads. Vite nests
 * output under its own `assets/` subdirectory by default, so this copies
 * recursively rather than the legacy CLI's flat, one-level `copyDir`.
 */

import { cp, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const BASE = '/integrations/hono'
const PUBLIC_DIR = join(ROOT, 'public')

await rm(PUBLIC_DIR, { recursive: true, force: true })

await mkdir(join(PUBLIC_DIR, `${BASE}/static/components`), { recursive: true })
await cp(join(ROOT, 'dist/static/components'), join(PUBLIC_DIR, `${BASE}/static/components`), { recursive: true })

await mkdir(join(PUBLIC_DIR, `${BASE}/shared/styles`), { recursive: true })
await cp(join(ROOT, '../shared/styles'), join(PUBLIC_DIR, `${BASE}/shared/styles`), { recursive: true })

console.log(`Assembled ./public${BASE}/`)
