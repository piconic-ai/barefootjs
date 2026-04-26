/**
 * Hero section — Design B
 *
 * Vertical layout: hero text on top, compiler flow diagram underneath.
 *   source code → Barefoot build → client.js (always) + selectable adapter
 *
 * Stateless server component; no signals required.
 */

import { highlight, initHighlighter } from './shared/highlighter'
import { SOURCE_CODE } from './shared/snippets'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type Adapter = {
  id: string
  badge: string
  cls: string
  name: string
  lang: string
  file: string
  snip: string
}

const ADAPTERS: Adapter[] = [
  { id: 'hono',        badge: 'H', cls: 'flow-badge-orange', name: 'Hono',        lang: 'JSX', file: 'Counter.tsx',     snip: 'Count: <span bf="slot_...' },
  { id: 'echo',        badge: 'E', cls: 'flow-badge-teal',   name: 'Echo',        lang: 'Go',  file: 'counter.tmpl',    snip: 'Count: <span bf="slot_...' },
  { id: 'mojolicious', badge: 'M', cls: 'flow-badge-red',    name: 'Mojolicious', lang: 'EPL', file: 'counter.html.ep', snip: 'Count: <span bf="slot_...' },
  { id: 'browser',     badge: 'B', cls: 'flow-badge-yellow', name: 'Browser',     lang: 'CSR', file: 'index.html',      snip: 'Count: <span bf="slot_...' },
]

// Inline barefoot footprint icon (5 toes)
const BAREFOOT_ICON = `<svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" class="flow-build-icon">
  <ellipse cx="18" cy="36" rx="9" ry="12" transform="rotate(-15 20 46)"/>
  <ellipse cx="38" cy="34" rx="7" ry="10" transform="rotate(-8 38 44)"/>
  <ellipse cx="54" cy="38" rx="6" ry="9" transform="rotate(0 54 50)"/>
  <ellipse cx="68" cy="46" rx="4.5" ry="7" transform="rotate(8 68 56)"/>
  <ellipse cx="80" cy="57" rx="3.5" ry="5.5" transform="rotate(15 80 60)"/>
</svg>`

async function buildDiagramHtml(): Promise<string> {
  await initHighlighter()
  const codeHtml = highlight(SOURCE_CODE, 'tsx')

  // Adapter tabs (Hono / Echo / Mojolicious / Browser) — left-aligned in right column
  const adapterTabs = ADAPTERS.map(
    (a, i) => `
    <button
      type="button"
      class="flow-output flow-adapter-tab${i === 0 ? ' is-active' : ''}"
      data-adapter="${a.id}"
      data-index="${i}"
      aria-pressed="${i === 0 ? 'true' : 'false'}"
    >
      <div class="flow-output-left">
        <span class="flow-badge ${a.cls}">${esc(a.badge)}</span>
        <div class="flow-output-info">
          <span class="flow-output-name">${esc(a.name)}</span>
          <span class="flow-output-lang">${esc(a.lang)}</span>
        </div>
      </div>
      <div class="flow-output-right">
        <span class="flow-output-file">${esc(a.file)}</span>
        <span class="flow-output-snippet">${esc(a.snip)}</span>
      </div>
    </button>`,
  ).join('')

  /*
   * SVG coordinate system: 200 × 500
   *
   *   Adapter list is vertically centred (height = 5×70 + 4×10 = 390px),
   *   so within the 500px connector it spans y=55..445. Box centres:
   *     client.js   (i=0): y =  90
   *     Hono        (i=1): y = 170
   *     Echo        (i=2): y = 250  ← straight from build
   *     Mojolicious (i=3): y = 330
   *     Browser     (i=4): y = 410
   *
   *   Build box: square 110×110, x=45..155, y=195..305 (centred at 100, 250).
   *   Source line enters connector at y=250.
   *
   *   client.js stays solid (Always). Exactly one of Hono/Echo/Mojolicious/
   *   Browser is solid; the rest are dashed. Active changes on click.
   */
  const G = '#22c55e'
  const Dg = '#4b5563'
  const ADAPTER_YS = [170, 250, 330, 410] // Hono, Echo, Mojolicious, Browser

  return `
    <div class="flow-diagram" id="flow-diagram">
      <div class="flow-source">
        <div class="flow-source-header">
          <div class="flow-source-header-left">
            <span class="flow-source-dot"></span>
            <span class="flow-source-filename">Counter.tsx</span>
          </div>
          <span class="flow-source-label">SOURCE</span>
        </div>
        <div class="flow-source-code">
          <pre class="shiki shiki-themes github-light github-dark" tabindex="0"><code>${codeHtml}</code></pre>
        </div>
      </div>

      <div class="flow-connector">
        <div class="flow-build">
          ${BAREFOOT_ICON}
          <img src="/static/logo-text.svg" alt="Barefoot.js" class="flow-build-logo-text" />
        </div>

        <svg class="flow-lines" viewBox="0 0 200 500" aria-hidden="true" preserveAspectRatio="none">
          <!-- source → build (left enters at y=250) -->
          <path d="M 0 250 L 45 250" stroke="${G}" stroke-width="2" fill="none"/>
          <circle cx="0" cy="250" r="3" fill="${G}"/>

          <!-- build → client.js (always solid, exits from TOP of build) -->
          <path d="M 100 195 L 100 90 L 200 90"
                stroke="${G}" stroke-width="2" fill="none"/>
          <circle cx="200" cy="90" r="3" fill="${G}"/>

          <!-- build → adapters (one solid for active, others dashed) -->
          ${ADAPTER_YS.map((y, i) => {
            // Echo (i=1) is at y=250 = straight from build, no elbow needed
            const path = y === 250
              ? `M 155 250 L 200 250`
              : `M 155 250 L 178 250 L 178 ${y} L 200 ${y}`
            const isActive = i === 0
            return `<path
              class="flow-adapter-line"
              data-adapter-line="${i}"
              d="${path}"
              stroke="${isActive ? G : Dg}"
              stroke-width="${isActive ? 2 : 1.5}"
              stroke-dasharray="${isActive ? '' : '5,4'}"
              fill="none"
            /><circle
              class="flow-adapter-dot"
              data-adapter-dot="${i}"
              cx="200" cy="${y}" r="3"
              fill="${isActive ? G : Dg}"
            />`
          }).join('')}
        </svg>
      </div>

      <div class="flow-adapters" role="tablist" aria-label="Output adapter">
        <!-- client.js: always solid, never selectable -->
        <div class="flow-output flow-output-client">
          <div class="flow-output-left">
            <span class="flow-badge flow-badge-green">JS</span>
            <div class="flow-output-info">
              <span class="flow-output-name">client.js</span>
              <span class="flow-output-lang">Always</span>
            </div>
          </div>
          <div class="flow-output-right">
            <span class="flow-output-file">HYDRATION RUNTIME</span>
            <span class="flow-output-snippet">// binds signals to bf_...</span>
          </div>
        </div>
        ${adapterTabs}
      </div>
    </div>

    <script>
      (function () {
        var diagram = document.getElementById('flow-diagram');
        if (!diagram) return;
        var GREEN = '${G}';
        var GRAY = '${Dg}';
        var tabs = diagram.querySelectorAll('.flow-adapter-tab');
        var lines = diagram.querySelectorAll('.flow-adapter-line');
        var dots = diagram.querySelectorAll('.flow-adapter-dot');
        tabs.forEach(function (tab) {
          tab.addEventListener('click', function () {
            var idx = parseInt(tab.getAttribute('data-index') || '0', 10);
            tabs.forEach(function (t) {
              t.classList.remove('is-active');
              t.setAttribute('aria-pressed', 'false');
            });
            tab.classList.add('is-active');
            tab.setAttribute('aria-pressed', 'true');
            lines.forEach(function (l, i) {
              var active = i === idx;
              l.setAttribute('stroke', active ? GREEN : GRAY);
              l.setAttribute('stroke-width', active ? '2' : '1.5');
              l.setAttribute('stroke-dasharray', active ? '' : '5,4');
            });
            dots.forEach(function (d, i) {
              d.setAttribute('fill', i === idx ? GREEN : GRAY);
            });
          });
        });
      })();
    </script>`
}

export async function Hero() {
  const diagramHtml = await buildDiagramHtml()

  return (
    <section className="hero-b">
      <div className="hero-b-content">
        <div className="hero-b-text">
          <h1 className="hero-b-heading fade-in">
            TSX in.{' '}
            <span className="hero-b-accent">Your template language out.</span>
          </h1>
          <p className="hero-b-body fade-in-1">
            Barefoot compiles signal-based TSX directly into{' '}
            <strong>Hono</strong>, <strong>Echo</strong>, or the browser.
            <br />
            No virtual DOM. No SPA required.
          </p>
          <div className="hero-b-buttons fade-in-2">
            <a href="/docs/introduction" className="btn-primary">Get Started</a>
            <a href="/playground" className="btn-secondary">Playground →</a>
          </div>
        </div>
        <div className="hero-b-diagram fade-in-3">
          <div dangerouslySetInnerHTML={{ __html: diagramHtml }} />
        </div>
      </div>
    </section>
  )
}
