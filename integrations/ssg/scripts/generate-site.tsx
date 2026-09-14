/** @jsxImportSource hono/jsx */
//
// Called by build.ts / build-watch.ts after `vite build` finishes:
//   1. Copy dist/static/components/* and ../shared/styles/* into public/
//      (assembling the self-contained directory Cloudflare Workers Assets serves)
//   2. Resolve each mount script's real (hashed) URL from the Vite manifest
//   3. Assemble a Hono app and write every page to public/*.html via hono/ssg's toSSG
//
// This function reruns on every `vite build --watch` cycle, so public/ (both the
// hashed assets and each page's <script src>) stays in sync with component edits.
import fs, { cp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Hono } from 'hono'
// `hono/bun`'s top level references the `Bun` global, which crashes when loaded from
// the Node.js-like environment Vite uses to evaluate config/plugins (the same
// constraint `integrations/hono/server.tsx` avoids by not importing `hono/bun`).
// Use the runtime-agnostic `hono/ssg` core API and pass `fs/promises` explicitly instead.
import { toSSG } from 'hono/ssg'
import { loadManifest, resolveScriptAssets, toPosixRelative } from '@barefootjs/vite'
import { Layout } from './layout.tsx'

type PageIsland = {
  path: string
  title: string
  heading: string
  extraStyles?: string[]
}

const PAGE_ISLANDS: PageIsland[] = [
  { path: 'counter', title: 'Counter Example - SSG', heading: 'Counter Example' },
  { path: 'toggle', title: 'Toggle Example - SSG', heading: 'Toggle Example' },
  { path: 'form', title: 'Form Example - SSG', heading: 'Form Example' },
  { path: 'portal', title: 'Portal Example - SSG', heading: 'Portal Example' },
  { path: 'reactive-props', title: 'Reactive Props Test - SSG', heading: 'Reactive Props Test' },
  {
    path: 'props-reactivity',
    title: 'Props Reactivity Comparison - SSG',
    heading: 'Props Reactivity Comparison',
  },
  {
    path: 'conditional-return',
    title: 'Conditional Return Example - SSG',
    heading: 'Conditional Return Example',
  },
  {
    path: 'conditional-return-link',
    title: 'Conditional Return Example (Link) - SSG',
    heading: 'Conditional Return Example (Link)',
  },
]

export async function generateSite(opts: { projectDir: string; outDir: string; basePath: string }) {
  const { projectDir, outDir, basePath: BASE } = opts
  const publicDir = join(projectDir, 'public')

  // 1) Assemble public/. Self-contained, with no dependency on dist/ (vite build's
  //    intermediate output) — same structure as hono's scripts/assemble-public.ts.
  await rm(publicDir, { recursive: true, force: true })
  await cp(outDir, join(publicDir, `${BASE}/static/components`), { recursive: true })
  await cp(join(projectDir, '../shared/styles'), join(publicDir, `${BASE}/shared/styles`), { recursive: true })

  // 2) Resolve each mount script's real URL from the manifest. The manifest key is
  //    NOT the rollupOptions.input key name — it's the entry file's absolute path
  //    made root-relative posix (toPosixRelative).
  const manifest = await loadManifest(outDir, true)
  const scriptBase = `${BASE}/static/components/`
  const mountScriptUrl = (pageName: string): string => {
    const absPath = join(projectDir, `client/pages/${pageName}.ts`)
    const key = toPosixRelative(projectDir, absPath)
    const [url] = resolveScriptAssets(manifest, key, scriptBase)
    if (!url) {
      throw new Error(
        `[ssg] island "${pageName}" (${key}) missing from manifest — did vite.config.ts's rollupOptions.input include it?`,
      )
    }
    return url
  }

  // 3) Assemble a Hono app and generate public/*.html via toSSG. `todos` differs
  //    structurally from the other pages (no heading, TodoApp owns its own UI),
  //    so it's registered separately outside the loop.
  const app = new Hono()

  app.get(`${BASE}/`, (c) =>
    c.html(
      <Layout title="BarefootJS + SSG" basePath={BASE}>
        <h1>BarefootJS + SSG (Static Site Generation) + Cloudflare Workers</h1>
        <nav>
          <ul>
            {PAGE_ISLANDS.map((p) => (
              <li>
                <a href={`${BASE}/${p.path}`}>{p.heading}</a>
              </li>
            ))}
            <li>
              <a href={`${BASE}/todos`}>Todo App (SSG + serverless API)</a>
            </li>
          </ul>
        </nav>
      </Layout>,
    ),
  )

  for (const p of PAGE_ISLANDS) {
    app.get(`${BASE}/${p.path}`, (c) =>
      c.html(
        <Layout title={p.title} basePath={BASE}>
          <h1>{p.heading}</h1>
          <div id="app" />
          <p>
            <a href={`${BASE}/`}>← Back</a>
          </p>
          <script type="module" src={mountScriptUrl(p.path)}></script>
        </Layout>,
      ),
    )
  }

  app.get(`${BASE}/todos`, (c) =>
    c.html(
      <Layout title="Todo App - SSG" basePath={BASE} extraStyles={[`${BASE}/shared/styles/todo-app.css`]}>
        <div id="app" />
        <script type="module" src={mountScriptUrl('todos')}></script>
      </Layout>,
    ),
  )

  const result = await toSSG(app, fs, { dir: publicDir })
  if (!result.success) throw result.error ?? new Error('[ssg] toSSG failed')
  console.log(`[ssg] wrote ${result.files.length} files to public/`)
}
