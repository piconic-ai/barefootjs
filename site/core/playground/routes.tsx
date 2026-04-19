/**
 * Playground routes.
 *
 * Serves GET /playground with a self-contained HTML page: Monaco editor,
 * a compiler web worker, and a live-preview iframe using the BarefootJS
 * client runtime.
 *
 * The worker and page-script bundles are produced by build.ts and served
 * from /static/playground/.
 */

import { Hono } from 'hono'

const DEFAULT_SOURCE = `'use client'

import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  return (
    <div style={{ padding: '12px 16px', border: '1px solid #ccc', borderRadius: '8px', display: 'inline-block' }}>
      <p>Count: {count()}</p>
      <button onClick={() => setCount(count() + 1)}>+1</button>
      <button onClick={() => setCount(count() - 1)} style={{ marginLeft: '8px' }}>-1</button>
    </div>
  )
}
`

export function createPlaygroundApp() {
  const app = new Hono()

  app.get('/', (c) => {
    const html = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Playground — Barefoot.js</title>
  <meta name="description" content="In-browser playground for BarefootJS: edit JSX, see the compiled output, and preview live." />
  <meta name="color-scheme" content="dark" />
  <link rel="icon" type="image/png" sizes="32x32" href="/static/icon-32.png" />
  <link rel="stylesheet" href="/static/globals.css" />
  <link rel="stylesheet" href="/static/uno.css" />
  <style>
    html, body { height: 100%; margin: 0; }
    body { font-family: var(--font-sans, system-ui, sans-serif); background: var(--background); color: var(--foreground); display: flex; flex-direction: column; }
    .pg-header { height: var(--header-height, 52px); padding: 0 16px; border-bottom: 1px solid var(--border); background: var(--background); display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
    @media (min-width: 640px) { .pg-header { padding: 0 24px; gap: 24px; } }
    .pg-header a { color: inherit; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; }
    .pg-logo { height: 1.65rem; width: auto; display: block; }
    .pg-sep { display: none; width: 1px; height: 20px; background: var(--border); }
    @media (min-width: 640px) { .pg-sep { display: block; } }
    .pg-status { margin-left: auto; font: 12px ui-monospace, monospace; color: var(--muted-foreground); display: inline-flex; align-items: center; gap: 6px; }
    .pg-status::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
    .pg-status[data-state="ready"] { color: oklch(0.75 0.14 150); }
    .pg-status[data-state="working"] { color: oklch(0.75 0.12 80); }
    .pg-status[data-state="error"] { color: oklch(0.70 0.19 22); }
    .pg-main { flex: 1; display: grid; grid-template-columns: 1fr 1fr; min-height: 0; }
    @media (max-width: 900px) { .pg-main { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; } }
    .pg-pane { display: flex; flex-direction: column; min-height: 0; min-width: 0; border-right: 1px solid var(--border); }
    .pg-pane:last-child { border-right: none; }
    .pg-pane-header { padding: 6px 12px; font: 12px ui-monospace, monospace; color: var(--muted-foreground); border-bottom: 1px solid var(--border); display: flex; gap: 4px; align-items: center; }
    .pg-editor { flex: 1; min-height: 0; }
    .pg-tab { background: transparent; border: 1px solid transparent; padding: 3px 10px; border-radius: 4px; font: inherit; color: inherit; cursor: pointer; }
    .pg-tab[aria-selected="true"] { border-color: var(--border); background: var(--muted); color: var(--foreground); }
    .pg-tab-body { flex: 1; min-height: 0; overflow: auto; background: var(--background); }
    .pg-tab-body[hidden] { display: none; }
    #pg-preview { width: 100%; height: 100%; border: 0; background: var(--background); display: block; color-scheme: dark; }
    .pg-code { margin: 0; padding: 12px; font: 12px/1.5 ui-monospace, monospace; white-space: pre; background: var(--muted); color: var(--foreground); height: 100%; box-sizing: border-box; }
    #pg-error { margin: 0; padding: 10px 16px; font: 12px/1.4 ui-monospace, monospace; color: oklch(0.80 0.15 22); background: oklch(0.25 0.05 22); border-top: 1px solid oklch(0.40 0.12 22); white-space: pre-wrap; flex-shrink: 0; }
    #pg-error[hidden] { display: none; }
  </style>
</head>
<body>
  <header class="pg-header">
    <a href="/" aria-label="Barefoot.js home"><img class="pg-logo" src="/static/logo-for-dark.svg" alt="Barefoot.js" /></a>
    <span class="pg-sep" aria-hidden="true"></span>
    <span style="color: var(--muted-foreground); font-size: 14px;">Playground</span>
    <span id="pg-status" class="pg-status" data-state="working">Loading…</span>
  </header>
  <div class="pg-main">
    <section class="pg-pane">
      <div class="pg-pane-header">component.tsx</div>
      <div id="pg-editor" class="pg-editor"></div>
    </section>
    <section class="pg-pane">
      <div class="pg-pane-header" role="tablist">
        <button id="pg-tab-button-preview" class="pg-tab" data-pg-tab="preview" role="tab" aria-selected="true" aria-controls="pg-tab-preview">Preview</button>
        <button id="pg-tab-button-ir" class="pg-tab" data-pg-tab="ir" role="tab" aria-selected="false" aria-controls="pg-tab-ir">IR</button>
        <button id="pg-tab-button-clientjs" class="pg-tab" data-pg-tab="clientJs" role="tab" aria-selected="false" aria-controls="pg-tab-clientjs">Client JS</button>
      </div>
      <div class="pg-tab-body" id="pg-tab-preview" role="tabpanel" aria-labelledby="pg-tab-button-preview"><iframe id="pg-preview" sandbox="allow-scripts" title="Preview"></iframe></div>
      <div class="pg-tab-body" id="pg-tab-ir" role="tabpanel" aria-labelledby="pg-tab-button-ir" hidden><pre id="pg-ir" class="pg-code"></pre></div>
      <div class="pg-tab-body" id="pg-tab-clientjs" role="tabpanel" aria-labelledby="pg-tab-button-clientjs" hidden><pre id="pg-clientjs" class="pg-code"></pre></div>
    </section>
  </div>
  <pre id="pg-error" hidden></pre>
  <script>
    window.PLAYGROUND_WORKER_URL = '/static/playground/worker.js'
    window.PLAYGROUND_INITIAL_SOURCE = ${JSON.stringify(DEFAULT_SOURCE)};
  </script>
  <script type="module" src="/static/playground/page.js"></script>
</body>
</html>`

    return c.html(html)
  })

  return app
}
