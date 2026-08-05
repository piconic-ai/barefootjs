/**
 * `scriptAssets` resolution from Vite's build manifest (`build.manifest =
 * true`, forced on by this plugin's `config` hook). By `writeBundle` time
 * the manifest is final — every entry's hashed output filename is known —
 * which is exactly why template emission happens there and not in
 * `transform` (see the design's "script URL late-binding" section).
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Manifest } from 'vite'

/** Read and parse the manifest Vite just wrote to `outDir`. `manifestOption`
 * mirrors `build.manifest`: `true` → the default `.vite/manifest.json`
 * path; a string → that custom path, relative to `outDir`. */
export async function loadManifest(outDir: string, manifestOption: boolean | string): Promise<Manifest> {
  const relPath = typeof manifestOption === 'string' ? manifestOption : '.vite/manifest.json'
  const content = await readFile(resolve(outDir, relPath), 'utf8')
  return JSON.parse(content) as Manifest
}

/** Join a Vite `base` (may or may not have a trailing slash; may be a full
 * URL, an absolute path, or `'./'`) with a manifest-relative file path
 * (never starts with `/`) into the URL an adapter should register. */
export function joinBaseAndFile(base: string, file: string): string {
  if (base === '' || base === './') return file
  return base.endsWith('/') ? `${base}${file}` : `${base}/${file}`
}

/**
 * The ordered `scriptAssets` list for one component's entry, per the
 * design: just the entry's own hashed file — shared chunks (including the
 * `@barefootjs/client` runtime) arrive as ESM imports the browser follows
 * on its own, so they need no separate registration. `[]` when the entry
 * isn't in the manifest (e.g. a `'use client'` file whose compile produced
 * no client JS at all, or a stale discovery/build mismatch).
 */
export function resolveScriptAssets(
  manifest: Manifest,
  manifestKey: string,
  base: string,
): string[] {
  const entry = manifest[manifestKey]
  if (!entry) return []
  return [joinBaseAndFile(base, entry.file)]
}
