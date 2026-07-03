/**
 * Emit `dist/blog-data.json` for the Axum blog routes.
 *
 * The shared blog islands (`../shared/blog/*`) are authored in TS and compiled
 * to minijinja templates by `bf build`, but the *data* the index/post routes
 * render (the post corpus, the derived list items with their pre-rendered
 * `meta`, the tag set) lives in `../shared/blog/posts.ts` — TS the Rust server
 * can't import. Rather than hand-transcribe the corpus into Rust (fragile, and
 * the kind of duplication the showcase explicitly avoids), this build step
 * imports the single source of truth and writes it as JSON that `src/blog.rs`
 * reads at startup — every adapter's server stays in sync with one authored
 * corpus. Port of `integrations/flask/scripts/gen-blog-data.ts`.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { posts, listItems, allTags } from '../../shared/blog/posts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const OUT = resolve(ROOT, 'dist/blog-data.json')

await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, JSON.stringify({ posts, listItems, allTags }, null, 0))
console.log(`Generated: dist/blog-data.json (${posts.length} posts)`)
