/**
 * Node-compatible runtime primitives used by the CLI build pipeline.
 *
 * Centralizes the handful of operations that historically targeted Bun
 * (file I/O, hashing, TS transpilation, glob matching) so the published
 * CLI runs unchanged under `node` / `npx` / `pnpm dlx` / `bunx`.
 *
 * Requires Node >= 22 (for `fs/promises.glob`).
 */

import { createHash } from 'node:crypto'
import { access, readFile, writeFile, glob as fsGlob } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { transformSync } from 'esbuild'

export async function readText(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

export async function readBytes(path: string): Promise<Uint8Array> {
  const buf = await readFile(path)
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

export async function writeText(path: string, content: string): Promise<void> {
  await writeFile(path, content, 'utf8')
}

export async function writeBytes(
  path: string,
  content: Uint8Array | ArrayBuffer,
): Promise<void> {
  const bytes = content instanceof ArrayBuffer ? new Uint8Array(content) : content
  await writeFile(path, bytes)
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Short non-cryptographic hash used for cache keys and content addressing.
 * sha256 truncated to 16 hex chars — plenty for equality checks, short
 * enough to embed in filenames.
 *
 * Note: switching from Bun.hash to sha256 changes the hash value space, so
 * existing `.buildcache.json` files will invalidate on first run after
 * upgrading. This is correct — a one-shot full rebuild, then cache
 * works normally again.
 */
export function hashString(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

/**
 * Byte-exact variant of `hashString` for files that may not be valid UTF-8
 * (notably `bun.lockb`, which is binary).
 */
export function hashBytes(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

export interface TranspileOptions {
  /** Source loader. Defaults to 'js'. */
  loader?: 'ts' | 'tsx' | 'js' | 'jsx'
  /** Produce minified output. Preserves identifiers and template literals. */
  minify?: boolean
}

/**
 * Transpile JS/TS source. Replaces `Bun.Transpiler` at the same call sites.
 *
 * Minification semantics match the compiler's original expectations: whitespace
 * and syntax are minified, identifiers are preserved (so hydration hooks like
 * `__bf_init_*` survive), and template literal contents (including inlined
 * HTML) are untouched.
 */
export function transpile(source: string, options: TranspileOptions = {}): string {
  const { loader = 'js', minify = false } = options
  const result = transformSync(source, {
    loader,
    minifyWhitespace: minify,
    minifySyntax: minify,
    minifyIdentifiers: false,
    target: 'es2022',
    format: 'esm',
    legalComments: 'none',
  })
  return result.code
}

export interface GlobOptions {
  cwd: string
}

/**
 * Match files by glob pattern. Returns paths relative to `cwd`.
 * Uses Node 22's built-in `fs.promises.glob` (no runtime dep).
 */
export async function globFiles(pattern: string, options: GlobOptions): Promise<string[]> {
  const results: string[] = []
  for await (const entry of fsGlob(pattern, { cwd: options.cwd })) {
    results.push(entry as string)
  }
  return results
}
