/**
 * The registry loader — every `limitations/<id>.ts` entry, discovered from
 * the directory listing and keyed by its file name.
 *
 * Discovery is dynamic on purpose: an entry is registered by existing, so
 * adding or deleting a file is the whole change (no second list to keep in
 * step — the same "one decision, one implementation" rule the registry
 * itself exists to enforce). The file name IS the id; a module that does
 * not `export default defineLimitation({...})` fails loudly here rather
 * than being silently skipped.
 */

import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Limitation, LimitationSpec } from '../src/limitations'

const LIMITATIONS_DIR = path.dirname(fileURLToPath(import.meta.url))

const KINDS = new Set(['silent', 'refusal', 'by-design'])

/** Entry file base names (without `.ts`), sorted — everything in this directory but this loader. */
export function listLimitationIds(): string[] {
  return readdirSync(LIMITATIONS_DIR)
    .filter(f => f.endsWith('.ts') && f !== 'index.ts')
    .map(f => f.slice(0, -'.ts'.length))
    .sort()
}

async function loadEntry(id: string): Promise<Limitation> {
  const mod = (await import(`./${id}.ts`)) as { default?: unknown }
  const spec = mod.default
  if (!spec || typeof spec !== 'object' || !KINDS.has((spec as { kind?: unknown }).kind as string)) {
    throw new Error(
      `packages/adapter-tests/limitations/${id}.ts must \`export default defineLimitation({...})\` ` +
        `with a kind of 'silent' | 'refusal' | 'by-design'`,
    )
  }
  return { id, ...(spec as LimitationSpec) }
}

/** Every registered limitation, id attached, sorted by id. */
export const limitations: readonly Limitation[] = await Promise.all(listLimitationIds().map(loadEntry))

/** Registry lookup by id; `undefined` for an unknown id (the join test turns that into a failure). */
export function findLimitation(id: string): Limitation | undefined {
  return limitations.find(l => l.id === id)
}
