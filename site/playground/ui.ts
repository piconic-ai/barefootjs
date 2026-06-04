/**
 * Playground UI shell — served by the host Worker at `/`.
 *
 * A self-contained 3-panel page:
 *   - Left   : AI Chat placeholder (wired in Phase 4).
 *   - Middle : Code Explorer — an editable Monaco editor (file tree + one
 *              model per file), fed by `/_pg/files`. BarefootJS/Hono typings
 *              from `/_pg/types-bundle.json` give it autocomplete + diagnostics.
 *   - Right  : live Preview iframe pointing at `/_preview` (the Counter app
 *              running inside the Dynamic Worker).
 *
 * The HTML and the client script are plain strings so the host Worker (bundled
 * by wrangler) can serve them without a separate build step. Monaco is loaded
 * from a CDN via its AMD loader at runtime.
 *
 * The "Run" button now drives the full live-recompile loop: it collects every
 * editor model's text, sends them to the in-browser compile worker
 * (/_pg/compile-worker.js — compileAppCore + @barefootjs/jsx + UnoCSS +
 * esbuild-wasm), POSTs the resulting user modules to /_pg/build, then reloads
 * the preview iframe so the session app re-SSRs + re-hydrates.
 */

const MONACO_CDN = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs'

export const UI_SHELL_HTML = /* html */ `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BarefootJS Playground</title>
    <style>
      :root {
        --bg: #0b0e14;
        --bg-panel: #11161f;
        --bg-elev: #161c27;
        --border: #232b38;
        --fg: #e6edf3;
        --fg-muted: #8b949e;
        --accent: #4f9cff;
        --accent-soft: #1b2738;
        font-family:
          ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      * {
        box-sizing: border-box;
      }
      html,
      body {
        margin: 0;
        height: 100%;
        background: var(--bg);
        color: var(--fg);
      }
      body {
        display: flex;
        flex-direction: column;
      }
      header {
        display: flex;
        align-items: baseline;
        gap: 12px;
        padding: 12px 20px;
        border-bottom: 1px solid var(--border);
        background: var(--bg-panel);
      }
      header h1 {
        font-size: 16px;
        font-weight: 600;
        margin: 0;
        letter-spacing: 0.2px;
      }
      header .note {
        font-size: 12px;
        color: var(--fg-muted);
      }
      header .note a {
        color: var(--accent);
        text-decoration: none;
      }
      main {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: 1fr 1.4fr 1.2fr;
        gap: 1px;
        background: var(--border);
      }
      .panel {
        display: flex;
        flex-direction: column;
        min-height: 0;
        background: var(--bg);
        overflow: hidden;
      }
      .panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 14px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: var(--fg-muted);
        border-bottom: 1px solid var(--border);
        background: var(--bg-panel);
      }
      .panel-body {
        flex: 1;
        min-height: 0;
        overflow: auto;
      }

      /* --- Chat --- */
      .chat-messages {
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .chat-empty {
        margin: auto;
        text-align: center;
        color: var(--fg-muted);
        font-size: 13px;
        line-height: 1.6;
        max-width: 240px;
      }
      .chat-empty .badge {
        display: inline-block;
        margin-bottom: 10px;
        padding: 3px 10px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 11px;
        font-weight: 600;
      }
      /* Chat bubbles. */
      .chat-msg {
        max-width: 90%;
        padding: 8px 12px;
        border-radius: 10px;
        font-size: 13px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .chat-msg.user {
        align-self: flex-end;
        background: var(--accent-soft);
        color: var(--fg);
      }
      .chat-msg.assistant {
        align-self: flex-start;
        background: var(--bg-elev);
        color: var(--fg);
        border: 1px solid var(--border);
      }
      .chat-msg.status {
        align-self: flex-start;
        background: transparent;
        color: var(--fg-muted);
        font-size: 12px;
        font-style: italic;
        padding: 2px 4px;
      }
      .chat-msg.error {
        align-self: flex-start;
        background: #3a1d1d;
        color: #ffb4b4;
        border: 1px solid #5a2a2a;
      }
      .chat-input {
        display: flex;
        gap: 8px;
        padding: 12px;
        border-top: 1px solid var(--border);
        background: var(--bg-panel);
      }
      .chat-input textarea {
        flex: 1;
        padding: 9px 12px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--bg-elev);
        color: var(--fg);
        font-size: 13px;
        font-family: inherit;
        line-height: 1.5;
        resize: vertical;
        min-height: 38px;
        max-height: 200px;
      }
      .chat-input textarea::placeholder {
        color: var(--fg-muted);
      }
      .chat-input button {
        padding: 9px 16px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .chat-input button:hover {
        background: var(--bg-elev);
      }
      :disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      /* --- Explorer --- */
      .explorer {
        display: grid;
        grid-template-columns: 200px 1fr;
        height: 100%;
        min-height: 0;
      }
      .file-tree {
        border-right: 1px solid var(--border);
        overflow: auto;
        padding: 6px;
        background: var(--bg-panel);
      }
      .file-tree button {
        display: block;
        width: 100%;
        text-align: left;
        padding: 6px 10px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--fg);
        font-size: 12.5px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        cursor: pointer;
      }
      .file-tree button:hover {
        background: var(--bg-elev);
      }
      .file-tree button.active {
        background: var(--accent-soft);
        color: var(--accent);
      }
      /* Dirty marker: a dot after edited (unsaved) files. */
      .file-tree button.dirty::after {
        content: "\\2022";
        color: var(--accent);
        margin-left: 6px;
        font-size: 14px;
        line-height: 1;
      }
      #editor {
        width: 100%;
        height: 100%;
        min-height: 0;
      }
      .editor-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--fg-muted);
        font-size: 13px;
      }

      /* --- Code Explorer header actions (Run / status) --- */
      .explorer-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 11px;
        text-transform: none;
        letter-spacing: 0;
      }
      .explorer-actions .run-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .explorer-actions .run-btn:hover {
        background: var(--bg-elev);
      }
      .explorer-actions .tag {
        color: var(--fg-muted);
      }

      /* --- Toast --- */
      .toast {
        position: fixed;
        bottom: 18px;
        left: 50%;
        transform: translateX(-50%) translateY(8px);
        padding: 10px 16px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--bg-elev);
        color: var(--fg);
        font-size: 13px;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
        opacity: 0;
        pointer-events: none;
        transition:
          opacity 0.18s ease,
          transform 0.18s ease;
        z-index: 50;
      }
      .toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      /* --- Preview --- */
      .preview-actions {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 11px;
        text-transform: none;
        letter-spacing: 0;
      }
      .preview-actions a,
      .preview-actions button {
        color: var(--accent);
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 12px;
        text-decoration: none;
        padding: 0;
      }
      .preview-actions a:hover,
      .preview-actions button:hover {
        text-decoration: underline;
      }
      /* --- Preview URL bar (mini-browser chrome) --- */
      .url-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        border-bottom: 1px solid var(--border);
        background: var(--bg-panel);
      }
      .url-bar button {
        flex: 0 0 auto;
        padding: 4px 10px;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--bg-elev);
        color: var(--fg);
        font-size: 13px;
        cursor: pointer;
      }
      .url-bar button:hover {
        background: var(--accent-soft);
        color: var(--accent);
      }
      .url-bar #url-back {
        font-size: 16px;
        line-height: 1;
        padding: 3px 9px;
      }
      .url-bar input {
        flex: 1;
        min-width: 0;
        padding: 5px 10px;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--bg-elev);
        color: var(--fg);
        font-size: 12.5px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      .url-bar input:focus {
        outline: none;
        border-color: var(--accent);
      }
      .preview-body {
        flex: 1;
        min-height: 0;
        background: #fff;
      }
      iframe#preview {
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>BarefootJS Playground</h1>
      <span class="note">
        Running live on
        <a href="https://developers.cloudflare.com/dynamic-workers/" target="_blank" rel="noreferrer"
          >Cloudflare Dynamic Workers</a
        >
        &middot; Barefoot + Hono + UnoCSS
      </span>
    </header>
    <main>
      <!-- Left: AI Chat -->
      <section class="panel" aria-label="AI Chat">
        <div class="panel-head">AI Chat</div>
        <div class="chat-messages" id="chat-messages">
          <div class="chat-empty" id="chat-empty">
            <span class="badge">Barefoot agent</span>
            <div>
              Ask the AI to build or edit this multi-route app, e.g. "add a
              /todo route with a todo list". The reply edits
              <code>server.tsx</code> + the page components under
              <code>src/</code> and the preview recompiles automatically.
            </div>
          </div>
        </div>
        <div class="chat-input">
          <textarea
            id="chat-input"
            placeholder="Ask the AI agent…  (Enter for newline, Send to submit)"
            rows="2"
          ></textarea>
          <button type="button" id="chat-send">Send</button>
        </div>
      </section>

      <!-- Middle: Code Explorer (editable Monaco editor) -->
      <section class="panel" aria-label="Code Explorer">
        <div class="panel-head">
          Code Explorer
          <span class="explorer-actions">
            <span class="tag">editable</span>
            <button type="button" id="run-btn" class="run-btn" title="Live preview recompile — coming next">
              ▶ Run
            </button>
          </span>
        </div>
        <div class="panel-body">
          <div class="explorer">
            <nav class="file-tree" id="file-tree" aria-label="Files"></nav>
            <div id="editor"><div class="editor-loading">Loading editor…</div></div>
          </div>
        </div>
      </section>

      <!-- Right: Live Preview (mini-browser) -->
      <section class="panel" aria-label="Preview">
        <div class="panel-head">
          Preview
          <span class="preview-actions">
            <button type="button" id="refresh-preview">Reload</button>
            <a id="open-tab" href="/_preview" target="_blank" rel="noreferrer">Open in new tab ↗</a>
          </span>
        </div>
        <div class="url-bar">
          <button type="button" id="url-back" title="Back" aria-label="Back">‹</button>
          <button type="button" id="url-reload" title="Reload this page" aria-label="Reload">⟳</button>
          <input
            type="text"
            id="url-input"
            value="/"
            spellcheck="false"
            autocomplete="off"
            aria-label="App path"
          />
          <button type="button" id="url-go">Go</button>
        </div>
        <div class="preview-body">
          <iframe
            id="preview"
            src="/_preview"
            title="Live preview"
            sandbox="allow-scripts allow-same-origin"
          ></iframe>
        </div>
      </section>
    </main>

    <div class="toast" id="toast" role="status" aria-live="polite"></div>

    <script type="module" src="/_pg/app.js"></script>
  </body>
</html>
`

export const UI_CLIENT_JS = /* js */ `
// Playground UI client. Vanilla JS, no framework.
//
// Loads Monaco from a CDN, fetches the BarefootJS/Hono type bundle and feeds it
// to Monaco's TS service (so imports resolve + diagnostics are accurate),
// fetches the app's source files from /_pg/files, and creates one Monaco model
// per file. Clicking a file in the tree switches the editor's model. Edits are
// kept in memory; changed files get a dirty marker in the tree.
//
// The "Run" button drives the live-recompile loop: collect every model's text,
// hand it to the compile web worker (esbuild-wasm + @barefootjs/jsx in the
// browser), POST the compiled user modules to /_pg/build, then reload the
// preview iframe so the session app re-SSRs + re-hydrates.

const MONACO_CDN = ${JSON.stringify(MONACO_CDN)}

const treeEl = document.getElementById('file-tree')
const editorEl = document.getElementById('editor')
const runBtn = document.getElementById('run-btn')
const refreshBtn = document.getElementById('refresh-preview')
const iframe = document.getElementById('preview')
const toastEl = document.getElementById('toast')
const urlInputEl = document.getElementById('url-input')
const urlGoEl = document.getElementById('url-go')
const urlBackEl = document.getElementById('url-back')
const urlReloadEl = document.getElementById('url-reload')
const openTabEl = document.getElementById('open-tab')
const chatMessagesEl = document.getElementById('chat-messages')
const chatEmptyEl = document.getElementById('chat-empty')
const chatInputEl = document.getElementById('chat-input')
const chatSendEl = document.getElementById('chat-send')

let toastTimer = null
function showToast(message) {
  if (!toastEl) return
  toastEl.textContent = message
  toastEl.classList.add('show')
  if (toastTimer !== null) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600)
}

// --- Compile worker orchestration -------------------------------------------
// The compile worker is a module web worker that runs the BarefootJS compiler +
// esbuild-wasm in the browser. We spawn it once, eagerly (esbuild-wasm init is
// the heavy part), and reuse it for every Run.

let editorEntries = [] // populated by init(): { file, model, original, ... }
let monacoRef = null // the loaded monaco namespace (set in init)
let editorRef = null // the Monaco editor instance (set in init)
let addFileToTree = null // (entry) => void; appends a tree button (set in init)
let selectByPath = null // (path) => void; focuses a file in the editor (set in init)
let compileWorker = null
let workerReady = false
let nextCompileId = 1
const pendingCompiles = new Map() // id -> { resolve, reject }

function ensureCompileWorker() {
  if (compileWorker) return compileWorker
  compileWorker = new Worker('/_pg/compile-worker.js', { type: 'module' })
  compileWorker.addEventListener('message', (event) => {
    const msg = event.data
    if (!msg) return
    if (msg.type === 'ready') {
      workerReady = true
      return
    }
    if (msg.type === 'result') {
      const pending = pendingCompiles.get(msg.id)
      if (!pending) return
      pendingCompiles.delete(msg.id)
      if (msg.ok) pending.resolve(msg)
      else pending.reject(new Error((msg.errors || ['Compile failed']).join('\\n')))
    }
  })
  compileWorker.addEventListener('error', (e) => {
    // Reject all in-flight compiles so Run never hangs.
    for (const [, p] of pendingCompiles) p.reject(new Error('Compile worker crashed: ' + e.message))
    pendingCompiles.clear()
  })
  return compileWorker
}

function compileFiles(files) {
  const worker = ensureCompileWorker()
  const id = nextCompileId++
  return new Promise((resolve, reject) => {
    pendingCompiles.set(id, { resolve, reject })
    worker.postMessage({ type: 'compile', id, files })
  })
}

// Load Monaco via its AMD loader (same approach as site/core/playground).
function loadMonaco() {
  return new Promise((resolve, reject) => {
    const loaderScript = document.createElement('script')
    loaderScript.src = MONACO_CDN + '/loader.js'
    loaderScript.onload = () => {
      const req = window.require
      req.config({ paths: { vs: MONACO_CDN } })
      req(['vs/editor/editor.main'], () => resolve(window.monaco))
    }
    loaderScript.onerror = () =>
      reject(new Error('Failed to load Monaco editor from CDN'))
    document.head.appendChild(loaderScript)
  })
}

// Map a file path to the Monaco language id. TSX/JSX use 'typescript' so the
// TS service (and our type bundle) drives them; non-code files fall back.
function monacoLanguage(lang, path) {
  if (path.endsWith('.tsx') || path.endsWith('.ts')) return 'typescript'
  if (path.endsWith('.jsx') || path.endsWith('.js')) return 'javascript'
  if (path.endsWith('.css')) return 'css'
  if (path.endsWith('.json')) return 'json'
  return 'plaintext'
}

function fail(message) {
  editorEl.innerHTML =
    '<div class="editor-loading">' + message + '</div>'
}

async function init() {
  let monaco
  try {
    monaco = await loadMonaco()
  } catch (err) {
    fail('Failed to load editor: ' + err)
    return
  }
  monacoRef = monaco

  // Feed the BarefootJS/Hono typings to the TS service BEFORE creating models
  // so the first parse already resolves @barefootjs/client + JSX.
  try {
    const res = await fetch('/_pg/types-bundle.json')
    if (!res.ok) throw new Error('types-bundle.json responded ' + res.status)
    const bundle = await res.json()
    for (const path of Object.keys(bundle)) {
      monaco.languages.typescript.typescriptDefaults.addExtraLib(
        bundle[path],
        path,
      )
    }
  } catch (err) {
    // Non-fatal: the editor still works without typed JSX. Surface it for
    // devtools debugging.
    console.warn('Failed to load playground type bundle; typings unavailable.', err)
  }

  const ts = monaco.languages.typescript
  ts.typescriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: '@barefootjs/hono/jsx',
    allowNonTsExtensions: true,
    allowJs: true,
    noEmit: true,
    isolatedModules: true,
    esModuleInterop: true,
    skipLibCheck: true,
  })
  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: true,
  })

  let files = []
  try {
    const res = await fetch('/_pg/files')
    const data = await res.json()
    files = Array.isArray(data.files) ? data.files : []
  } catch (err) {
    fail('Failed to load files: ' + err)
    return
  }
  if (files.length === 0) {
    fail('No files.')
    return
  }

  // One model per file, keyed by a virtual file:/// URI so cross-file types
  // and the .tsx language association work.
  editorEl.innerHTML = ''
  const buttons = []
  const entries = files.map((file, index) => {
    const uri = monaco.Uri.parse('file:///' + file.path)
    const model =
      monaco.editor.getModel(uri) ||
      monaco.editor.createModel(
        file.content,
        monacoLanguage(file.lang, file.path),
        uri,
      )
    return { file, model, index, dirty: false, original: file.content }
  })
  // Expose for the Run handler (collects each model's current text).
  editorEntries = entries

  // Start warming esbuild-wasm in the compile worker as soon as the editor is
  // ready, so the first Run isn't paying the full init cost.
  ensureCompileWorker()

  const editor = monaco.editor.create(editorEl, {
    model: entries[0].model,
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    tabSize: 2,
    scrollBeyondLastLine: false,
  })
  editorRef = editor

  function select(index) {
    editor.setModel(entries[index].model)
    buttons.forEach((b, i) => b.classList.toggle('active', i === index))
  }

  // Wire one tree button for an entry, tracking its dirty marker. Reused both
  // for the initial files and for new files the AI agent creates at runtime.
  function wireTreeButton(entry) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = entry.file.path
    btn.addEventListener('click', () => select(entry.index))
    treeEl.appendChild(btn)
    buttons.push(btn)
    entry.button = btn

    entry.model.onDidChangeContent(() => {
      const dirty = entry.model.getValue() !== entry.original
      if (dirty !== entry.dirty) {
        entry.dirty = dirty
        btn.classList.toggle('dirty', dirty)
      }
    })
  }

  entries.forEach((entry) => wireTreeButton(entry))

  // Exposed for the chat flow: append a new file (model + tree entry).
  addFileToTree = (entry) => {
    entry.index = entries.length
    entries.push(entry)
    editorEntries = entries
    wireTreeButton(entry)
  }
  // Exposed for the chat flow: focus a file by its path.
  selectByPath = (path) => {
    const i = entries.findIndex((e) => e.file.path === path)
    if (i >= 0) select(i)
  }

  select(0)
}

// --- Preview mini-browser ----------------------------------------------------
// The preview iframe is a tiny same-origin browser. The URL bar holds an app
// path (e.g. '/' or '/counter'); navigating sets the iframe to that path, which
// the host routes into the session app. '/' maps to the iframe entry '/_preview'
// (so the very first load issues the session cookie); other paths load directly.
// A small history stack backs the Back button.

let currentPath = '/'
const navHistory = [] // visited paths, for Back

// Resolve an app path to the iframe URL the host understands, cache-busted so a
// recompile / reload always fetches fresh SSR + hydration.
function iframeUrlFor(path) {
  const p = path && path.startsWith('/') ? path : '/' + (path || '')
  const base = p === '/' ? '/_preview' : p
  const sep = base.includes('?') ? '&' : '?'
  return base + sep + 't=' + Date.now()
}

// Navigate the preview to an app path. When pushHistory is true the previous
// path is recorded so Back can return to it.
function navigatePreview(path, pushHistory = true) {
  if (!iframe) return
  const p = path && path.startsWith('/') ? path : '/' + (path || '')
  if (pushHistory && p !== currentPath) navHistory.push(currentPath)
  currentPath = p
  if (urlInputEl) urlInputEl.value = p
  if (openTabEl) openTabEl.setAttribute('href', p === '/' ? '/_preview' : p)
  iframe.src = iframeUrlFor(p)
}

// Reload the preview at the CURRENT path (no history change). Used after a
// successful compile so the new build is fetched fresh.
function reloadPreview() {
  if (!iframe) return
  iframe.src = iframeUrlFor(currentPath)
}

if (refreshBtn) {
  refreshBtn.addEventListener('click', () => reloadPreview())
}
if (urlGoEl && urlInputEl) {
  const go = () => navigatePreview(urlInputEl.value.trim() || '/')
  urlGoEl.addEventListener('click', go)
  urlInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      go()
    }
  })
}
if (urlBackEl) {
  urlBackEl.addEventListener('click', () => {
    const prev = navHistory.pop()
    if (prev != null) navigatePreview(prev, false)
  })
}
// Keep the URL bar in sync with the iframe's ACTUAL location after every load,
// so navigating via the app's own links (e.g. <a href="/counter">) updates the
// bar too — like a real browser. The iframe is same-origin, so we can read its
// location; the '/_preview' entry maps back to the app's '/'.
if (iframe) {
  iframe.addEventListener('load', () => {
    try {
      const loc = iframe.contentWindow && iframe.contentWindow.location
      if (!loc) return
      let p = loc.pathname
      if (p === '/_preview' || p === '/_preview/') p = '/'
      currentPath = p
      if (urlInputEl) urlInputEl.value = p
      if (openTabEl) openTabEl.setAttribute('href', p === '/' ? '/_preview' : p)
    } catch {
      // Same-origin in practice; ignore if a navigation ever blocks access.
    }
  })
}
if (urlReloadEl) {
  urlReloadEl.addEventListener('click', () => reloadPreview())
}

// The core live-recompile loop, shared by the Run button and the chat agent:
// collect every editor model's text → compile in the browser worker → POST to
// /_pg/build → cache-bust the preview iframe → clear dirty markers. Throws on
// compile/build failure so callers can surface the error their own way.
async function compileAndPreview() {
  if (!iframe) throw new Error('Preview iframe not ready')
  if (editorEntries.length === 0) throw new Error('Editor still loading')

  const files = {}
  for (const entry of editorEntries) {
    files[entry.file.path] = entry.model.getValue()
  }

  const result = await compileFiles(files)
  const res = await fetch('/_pg/build', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userModules: result.userModules,
      mainModule: result.mainModule,
      assets: result.assets,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error('Build upload failed: ' + (data.error || res.status))
  }
  // Reload the preview at the current URL-bar path so the new build is fetched
  // fresh (the page the user is looking at re-SSRs + re-hydrates).
  reloadPreview()
  // Edits are now live: clear dirty markers against the new baseline.
  for (const entry of editorEntries) {
    entry.original = entry.model.getValue()
    entry.dirty = false
    if (entry.button) entry.button.classList.remove('dirty')
  }
}

if (runBtn && iframe) {
  let running = false
  runBtn.addEventListener('click', async () => {
    if (running) return
    if (editorEntries.length === 0) {
      showToast('Editor still loading…')
      return
    }
    running = true
    const originalLabel = runBtn.textContent
    runBtn.disabled = true
    runBtn.textContent = workerReady ? '⏳ Compiling…' : '⏳ Warming up…'

    try {
      await compileAndPreview()
      showToast('Preview updated.')
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      // Keep the message short in the toast; full text to the console.
      console.error('Run failed:', err)
      showToast('Compile error: ' + msg.split('\\n')[0])
    } finally {
      running = false
      runBtn.disabled = false
      runBtn.textContent = originalLabel
    }
  })
}

// --- Chat agent -------------------------------------------------------------
// Sends the conversation + current file contents to /_pg/chat, streams the SSE
// reply into a chat bubble, then parses fenced \`\`\`lang path="..."\`\`\` blocks
// out of the completed reply, applies each to the matching Monaco model (new
// new model + tree entry for unknown paths), and runs compileAndPreview().

const chatHistory = [] // { role: 'user' | 'assistant', content }

function appendBubble(role, text) {
  if (!chatMessagesEl) return null
  if (chatEmptyEl && chatEmptyEl.parentNode) chatEmptyEl.remove()
  const el = document.createElement('div')
  el.className = 'chat-msg ' + role
  el.textContent = text || ''
  chatMessagesEl.appendChild(el)
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
  return el
}

// Parse all fenced file blocks: \`\`\`<lang> path="<path>"\\n<content>\\n\`\`\`
function parseFileBlocks(text) {
  const blocks = []
  const re = /\`\`\`[a-zA-Z0-9]*\\s+path="([^"]+)"\\s*\\n([\\s\\S]*?)\`\`\`/g
  let m
  while ((m = re.exec(text)) !== null) {
    let content = m[2]
    // Drop a single trailing newline kept before the closing fence.
    if (content.endsWith('\\n')) content = content.slice(0, -1)
    blocks.push({ path: m[1].trim(), content })
  }
  return blocks
}

// Apply one parsed block to the editor: update the model if the path exists,
// otherwise create a new model + tree entry. Returns true if anything changed.
function applyFileBlock(block) {
  if (!monacoRef) return false
  const existing = editorEntries.find((e) => e.file.path === block.path)
  if (existing) {
    if (existing.model.getValue() !== block.content) {
      existing.model.setValue(block.content)
    }
    return true
  }
  if (!addFileToTree) return false
  const uri = monacoRef.Uri.parse('file:///' + block.path)
  const model =
    monacoRef.editor.getModel(uri) ||
    monacoRef.editor.createModel(
      block.content,
      monacoLanguage(null, block.path),
      uri,
    )
  model.setValue(block.content)
  addFileToTree({
    file: { path: block.path, content: block.content, lang: monacoLanguage(null, block.path) },
    model,
    dirty: false,
    original: block.content,
  })
  return true
}

async function streamChat(messages, files, bubble) {
  // Mock mode kicks in automatically server-side when env.AI is absent, so the
  // client always posts to the same URL.
  const res = await fetch('/_pg/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, files }),
  })
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}))
    throw new Error('Chat request failed: ' + (data.error || res.status))
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buffer.indexOf('\\n\\n')) !== -1) {
      const rawEvent = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      for (const line of rawEvent.split('\\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload) continue
        let obj
        try {
          obj = JSON.parse(payload)
        } catch {
          continue
        }
        if (obj.error) throw new Error(obj.error)
        if (obj.done) return full
        if (typeof obj.delta === 'string') {
          full += obj.delta
          bubble.textContent = full
          chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
        }
      }
    }
  }
  return full
}

if (chatSendEl && chatInputEl) {
  let chatBusy = false
  async function sendChat() {
    if (chatBusy) return
    const text = chatInputEl.value.trim()
    if (!text) return

    chatBusy = true
    chatSendEl.disabled = true
    chatInputEl.disabled = true
    chatInputEl.value = ''

    appendBubble('user', text)
    chatHistory.push({ role: 'user', content: text })

    const assistantBubble = appendBubble('assistant', '')
    const statusBubble = appendBubble('status', 'Thinking…')

    // Snapshot current editor files so the agent edits the latest source.
    const files = editorEntries.map((e) => ({
      path: e.file.path,
      content: e.model.getValue(),
    }))

    try {
      const reply = await streamChat(chatHistory.slice(), files, assistantBubble)
      chatHistory.push({ role: 'assistant', content: reply })

      const blocks = parseFileBlocks(reply)
      if (blocks.length === 0) {
        statusBubble.remove()
        chatBusy = false
        chatSendEl.disabled = false
        chatInputEl.disabled = false
        chatInputEl.focus()
        return
      }

      let changed = false
      for (const block of blocks) {
        if (applyFileBlock(block)) changed = true
      }
      if (blocks.length > 0 && selectByPath) selectByPath(blocks[0].path)

      if (changed) {
        statusBubble.textContent = 'Compiling preview…'
        try {
          await compileAndPreview()
          statusBubble.remove()
          appendBubble('status', 'Preview updated.')
        } catch (err) {
          const msg = err && err.message ? err.message : String(err)
          console.error('Chat compile failed:', err)
          statusBubble.remove()
          appendBubble('error', 'Compile error: ' + msg.split('\\n')[0])
        }
      } else {
        statusBubble.remove()
      }
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.error('Chat failed:', err)
      if (statusBubble) statusBubble.remove()
      appendBubble('error', msg)
    } finally {
      chatBusy = false
      chatSendEl.disabled = false
      chatInputEl.disabled = false
      chatInputEl.focus()
    }
  }

  chatSendEl.addEventListener('click', sendChat)
  // Enter inserts a newline (textarea default); submit only via the Send
  // button, so multi-line prompts can be composed freely.
}

init()
`
