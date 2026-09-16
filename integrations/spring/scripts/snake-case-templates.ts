/**
 * Copy every compiled `<ComponentName>.peb` to a SNAKE_CASE-named sibling
 * (`<component_name>.peb`) so `bf.render_child('<snake_case>', ...)` calls
 * resolve against a real file on disk.
 *
 * WHY THIS EXISTS: `@barefootjs/vite`'s core plugin writes each
 * `templatesPerComponent` adapter's per-component file named AFTER THE
 * EXPORTED COMPONENT VERBATIM — `packages/vite/src/paths.ts`'s
 * `perComponentRelPath`: `${componentName}${extension}` (e.g.
 * `ToggleItem.peb`, PascalCase). But `PebbleAdapter`'s OWN emitted
 * `bf.render_child(...)` call sites (`pebble-adapter.ts`'s
 * `toTemplateName()`) snake_case that same name (`'toggle_item'`) — a
 * genuine naming-convention split between the core Vite plugin's file
 * writer and this ONE adapter's cross-template call-site naming. The
 * conformance test harness (`packages/adapter-pebble/src/test-render.ts`)
 * never hits this: it writes its OWN throwaway copies of every template
 * pre-named `${toSnakeCase(componentName)}.peb` into a temp directory,
 * side-stepping the real Vite file-writing path entirely. A REAL
 * `bun run build` never gets that renaming step, so this integration is —
 * as far as this research could establish — the first REAL, disk-backed
 * `bf build` output to actually exercise Pebble's `render_child` end to
 * end, and the first to surface this gap.
 *
 * Root-level page renders (`Render.renderRoot`) are UNAFFECTED — they look
 * up the ACTUAL (PascalCase) filename directly, never the snake_case
 * registry key (see that method's own comment). This script exists purely
 * so a CHILD component reached via `bf.render_child(...)` — `ToggleItem`,
 * `TodoItem`, `PostListItem`, `LikeButton`, `ReadingTimer`, `NowPlaying`,
 * `ReaderToolbar`, `ReactiveChild`, `PropsStyleChild`,
 * `DestructuredStyleChild`, … — is reachable too.
 *
 * Filed as a `known-limitation` follow-up for `@barefootjs/pebble` itself
 * (either `toTemplateName()` should stop snake-casing and call
 * `render_child` with the exact component name instead, or the adapter
 * should ship this exact copy step as part of its own Vite plugin) —
 * tracked separately; this script is the integration-level workaround
 * until that lands, mirroring how `render.rs`'s `EXTRA_CHILDREN` list is
 * itself a documented workaround for a different, adjacent manifest gap.
 */
import { readdir, copyFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = resolve(HERE, '../src/main/resources/templates')

/** Byte-identical to `PebbleAdapter.toTemplateName()` / `test-render.ts`'s `toSnakeCase()`. */
function toSnakeCase(name: string): string {
  return name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
}

let copied = 0
const entries = await readdir(TEMPLATES_DIR)
for (const entry of entries) {
  if (extname(entry) !== '.peb') continue
  const base = entry.slice(0, -'.peb'.length)
  const snake = toSnakeCase(base)
  if (snake === base) continue // already snake_case-shaped (no uppercase letters) -- nothing to alias
  await copyFile(join(TEMPLATES_DIR, entry), join(TEMPLATES_DIR, `${snake}.peb`))
  copied++
}
console.log(`Aliased ${copied} template(s) to their snake_case render_child name`)
