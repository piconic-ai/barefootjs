/**
 * Build one or more peitho slide decks into public/slides/<slug>/.
 *
 *   bun run slides:build <slug> [<slug>...]   build the named decks
 *   bun run slides:build --all                build every deck under slides/
 *
 * Convention (one directory per deck, see slides/README.md):
 *   slides/<slug>/deck.md          required — the peitho deck (layouts/, css/ next to it are
 *                                  picked up by peitho's zero-config asset lookup)
 *   slides/<slug>/slide.json       optional — { "title": "..." } for the page <title>
 *   slides/<slug>/assets/          optional — media copied verbatim into the output's assets/
 *                                  (*.md files such as SOURCES.md are skipped)
 *   slides/<slug>/component/       optional — a Vite project (barefoot() + CSRAdapter) whose
 *                                  non-component entries are bundled into assets/deck.js and
 *                                  injected into index.html
 *
 * The output (public/slides/<slug>/) is gitignored and rebuilt by `bun run build` (see
 * build.ts), which invokes `--all` as its first step. deploy.yml and ci-slides.yml install a
 * pinned peitho release before that, so it is always present there. On a plain local `bun run
 * build` peitho commonly isn't installed, so `--all` degrades to a skip-with-warning instead
 * of failing the whole build — an explicit slug (`slides:build overview`) still hard-fails,
 * since that's a deliberate request to build one deck, not an incidental part of `build`. Set
 * PEITHO to the binary path when it is not on PATH.
 */
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CORE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SLIDES_DIR = resolve(CORE_DIR, 'slides')
const OUT_ROOT = resolve(CORE_DIR, 'public', 'slides')
const PEITHO = process.env.PEITHO ?? 'peitho'

function run(cmd: string[], cwd: string): void {
  const proc = Bun.spawnSync(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' })
  if (proc.exitCode !== 0) {
    console.error(`\n✗ ${cmd.join(' ')} (in ${cwd}) exited with ${proc.exitCode}`)
    process.exit(proc.exitCode || 1)
  }
}

function listDecks(): string[] {
  return readdirSync(SLIDES_DIR)
    .filter((name) => statSync(join(SLIDES_DIR, name)).isDirectory() && existsSync(join(SLIDES_DIR, name, 'deck.md')))
    .sort()
}

function buildDeck(slug: string): void {
  const src = join(SLIDES_DIR, slug)
  const out = join(OUT_ROOT, slug)
  if (!existsSync(join(src, 'deck.md'))) {
    console.error(`✗ slides/${slug}/deck.md not found`)
    process.exit(1)
  }
  console.log(`\n▸ ${slug}`)

  // 1. peitho: viewer + slides + css (rewrites index.html from scratch every time)
  run([PEITHO, 'build', 'deck.md', '--out', out], src)

  // 2. media assets
  const assetsSrc = join(src, 'assets')
  const assetsOut = join(out, 'assets')
  mkdirSync(assetsOut, { recursive: true })
  if (existsSync(assetsSrc)) {
    for (const f of readdirSync(assetsSrc)) {
      if (f.endsWith('.md')) continue
      cpSync(join(assetsSrc, f), join(assetsOut, f), { recursive: true })
    }
  }

  // 3. interactive components → assets/deck.js
  let indexHtml = readFileSync(join(out, 'index.html'), 'utf8')
  const componentDir = join(src, 'component')
  if (existsSync(join(componentDir, 'package.json'))) {
    run(['bunx', 'vite', 'build'], componentDir)
    const manifest = JSON.parse(readFileSync(join(componentDir, 'dist', '.vite', 'manifest.json'), 'utf8')) as Record<string, { file: string; isEntry?: boolean }>
    // The barefoot() plugin adds one entry per component; the deck's own entries (mount, chrome)
    // import those, so only non-component entries are bundled. One entry → one runtime instance.
    const entries = Object.entries(manifest)
      .filter(([key, v]) => v.isEntry && !key.startsWith('components/'))
      .map(([, v]) => `import './${v.file}'`)
    if (entries.length === 0) {
      console.error(`✗ slides/${slug}/component: no non-component entry in vite manifest`)
      process.exit(1)
    }
    writeFileSync(join(componentDir, 'dist', 'entry.js'), entries.join('\n') + '\n')
    run(['bun', 'build', 'dist/entry.js', '--bundle', '--format=esm', '--minify', `--outfile=${join(assetsOut, 'deck.js')}`], componentDir)
    indexHtml = indexHtml.replace('<head>', '<head>\n  <script type="module" src="assets/deck.js"></script>')
  }

  // 4. page title (peitho writes "Peitho Deck")
  const metaPath = join(src, 'slide.json')
  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { title?: string }
    if (meta.title) indexHtml = indexHtml.replace('<title>Peitho Deck</title>', `<title>${escapeHtml(meta.title)}</title>`)
  }
  writeFileSync(join(out, 'index.html'), indexHtml)

  // 5. language variants: deck.<lang>.md next to deck.md is the same deck in another
  //    language (same keys and layouts). Each is built into <out>/<lang>/ keeping only its
  //    slides/ and manifest.json; a head shim (below) serves those to the viewer when that
  //    language is selected, so one URL carries every language. The chrome's toggle
  //    (component/narration.ts) writes the choice to localStorage("bf-lang") and reloads.
  const langs = readdirSync(src).map((n) => /^deck\.([a-z]{2,3}(?:-[A-Za-z0-9]+)?)\.md$/.exec(n)?.[1]).filter((l): l is string => !!l)
  for (const lang of langs) {
    const langOut = join(out, lang)
    rmSync(langOut, { recursive: true, force: true })
    run([PEITHO, 'build', `deck.${lang}.md`, '--out', langOut], src)
    for (const f of readdirSync(langOut)) if (f !== 'slides' && f !== 'manifest.json') rmSync(join(langOut, f), { recursive: true, force: true })
  }
  if (langs.length > 0) {
    const shim = `<script id="bf-lang-shim">/* built by build-slides.ts: serve manifest.json and slides/* from <lang>/ when that language is selected */
(function(){var langs=${JSON.stringify(langs)};window.__BF_LANGS=langs;try{var l=localStorage.getItem('bf-lang');if(!l||langs.indexOf(l)<0)return;window.__BF_LANG=l;document.documentElement.lang=l;var f=window.fetch;window.fetch=function(u,o){var s=typeof u==='string'?u:(u&&u.url)||'';if(s==='manifest.json'||s.indexOf('slides/')===0)u=l+'/'+s;return f.call(this,u,o)}}catch(e){}})();</script>`
    indexHtml = indexHtml.replace('<head>', `<head>\n  ${shim}`)
    writeFileSync(join(out, 'index.html'), indexHtml)
  }

  // 6. repo facts a deck may quote: %%COMPAT_COMPONENTS%% / %%COMPAT_ADAPTERS%% are replaced
  //    with the counts from ui/compat.lock.json (the same source as the landing page's
  //    matrix), so a deck never carries a hand-typed component count that drifts.
  const facts = compatFacts()
  const langFiles = langs.flatMap((lang) => [join(lang, 'manifest.json'), ...readdirSync(join(out, lang, 'slides')).map((n) => join(lang, 'slides', n))])
  for (const f of ['index.html', 'manifest.json', ...readdirSync(join(out, 'slides')).map((n) => join('slides', n)), ...langFiles]) {
    const path = join(out, f)
    if (!existsSync(path)) continue
    const before = readFileSync(path, 'utf8')
    const after = before.replaceAll('%%COMPAT_COMPONENTS%%', String(facts.components)).replaceAll('%%COMPAT_ADAPTERS%%', String(facts.adapters))
    if (after !== before) writeFileSync(path, after)
  }

  // 7. peitho copies its built-in theme fonts even when the deck ships its own css
  const css = readFileSync(join(out, 'peitho.css'), 'utf8')
  if (!css.includes('theme-fonts/')) rmSync(join(out, 'theme-fonts'), { recursive: true, force: true })

  console.log(`✓ public/slides/${slug}/`)
}

/** Component and adapter counts from the committed compat matrix (ui/compat.lock.json). */
function compatFacts(): { components: number; adapters: number } {
  const lock = JSON.parse(readFileSync(resolve(CORE_DIR, '../../ui/compat.lock.json'), 'utf8')) as { components: Record<string, unknown>; adapters: unknown[] | Record<string, unknown> }
  return { components: Object.keys(lock.components).length, adapters: Array.isArray(lock.adapters) ? lock.adapters.length : Object.keys(lock.adapters).length }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

const args = process.argv.slice(2)
const isAllMode = args.includes('--all')

if (isAllMode && !Bun.which(PEITHO)) {
  console.warn(`⚠ peitho not found (looked for "${PEITHO}" — set PEITHO=<path> if it's installed elsewhere).`)
  console.warn(`  Skipping slide deck build; dist/slides/ will be empty. Install peitho to build them locally:`)
  console.warn(`  https://github.com/mizzy/peitho/releases`)
  process.exit(0)
}

const slugs = isAllMode ? listDecks() : args.filter((a) => !a.startsWith('-'))
if (slugs.length === 0) {
  console.error('usage: bun run slides:build <slug> [<slug>...] | --all\navailable: ' + (listDecks().join(', ') || '(none)'))
  process.exit(1)
}
for (const slug of slugs) buildDeck(slug)
