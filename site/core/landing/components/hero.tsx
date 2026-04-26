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
  name: string
  lang: string
  // Either a logo url (svg in /static/logos/) or an inline svg string for icons
  // we don't have an asset for (Browser).
  logo?: string
  inlineIcon?: string
}

// Browser icon (inline SVG, fallback for adapters without a brand logo file).
const BROWSER_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="9"/>
  <path d="M3 12h18"/>
  <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/>
</svg>`

const ADAPTERS: Adapter[] = [
  // Icon-only marks: hono.dev official mark, labstack avatar (Echo),
  // Mojolicious favicon. Each is a square asset that fits the 36×36 slot.
  { id: 'hono',        name: 'Hono',        lang: 'TypeScript',            logo: '/static/logos/hono-icon.svg' },
  { id: 'echo',        name: 'Echo',        lang: 'Go',                     logo: '/static/logos/echo-icon.png' },
  { id: 'mojolicious', name: 'Mojolicious', lang: 'Perl',                   logo: '/static/logos/mojo-icon.png' },
  { id: 'browser',     name: 'Browser',     lang: 'Client Side Rendering',  inlineIcon: BROWSER_ICON },
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
  const adapterTabs = ADAPTERS.map((a, i) => {
    const iconHtml = a.logo
      ? `<img src="${esc(a.logo)}" alt="" class="flow-adapter-logo" />`
      : a.inlineIcon
        ? `<span class="flow-adapter-logo flow-adapter-logo-inline">${a.inlineIcon}</span>`
        : ''
    return `
    <button
      type="button"
      class="flow-output flow-adapter-tab${i === 0 ? ' is-active' : ''}"
      data-adapter="${a.id}"
      data-index="${i}"
      aria-pressed="${i === 0 ? 'true' : 'false'}"
    >
      ${iconHtml}
      <div class="flow-output-info">
        <span class="flow-output-name">${esc(a.name)}</span>
        <span class="flow-output-lang">${esc(a.lang)}</span>
      </div>
    </button>`
  }).join('')

  /*
   * Layout (CSS Grid 5 columns):
   *   col 1 (1fr):    hero-b-left  — text+buttons (top), source panel (bottom)
   *   col 2 (80px):   gutter for the source→build line
   *   col 3 (110px):  build node (vertically centred)
   *   col 4 (80px):   gutter for the build→adapter lines
   *   col 5 (320px):  adapter list — full container height, justify space-between
   *
   * SVG paths are computed at runtime against actual element rects; the static
   * markup only seeds <path>/<circle> nodes that the inline script populates.
   */
  const G = '#22c55e'
  const Dg = 'rgba(34, 197, 94, 0.28)'

  return `
    <div class="hero-b-grid" id="flow-diagram">
      <!-- LEFT COL: hero text + source panel -->
      <div class="hero-b-left">
        <div class="hero-b-text">
          <h1 class="hero-b-heading fade-in">
            TSX in. <span class="hero-b-accent">Your template language out.</span>
          </h1>
          <p class="hero-b-body fade-in-1">
            Barefoot compiles signal-based TSX directly into <strong>Hono</strong>, <strong>Echo</strong>, or the browser.
            <br />
            No virtual DOM. No SPA required.
          </p>
          <div class="hero-b-buttons fade-in-2">
            <a href="/docs/introduction" class="btn-primary">Get Started</a>
            <a href="/playground" class="btn-secondary">Playground →</a>
          </div>
        </div>
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
      </div>

      <!-- BUILD NODE (col 3) -->
      <div class="flow-build">
        ${BAREFOOT_ICON}
        <img src="/static/logo-text.svg" alt="Barefoot.js" class="flow-build-logo-text" />
      </div>

      <!-- ADAPTER LIST (col 5) — client.js on top, then Hono/Echo/Mojo/Browser -->
      <div class="flow-adapters" role="tablist" aria-label="Output adapter">
        <div class="flow-output flow-output-client">
          <img src="/static/logos/javascript-icon.png" alt="" class="flow-adapter-logo" />
          <div class="flow-output-info">
            <span class="flow-output-name">client.js</span>
            <span class="flow-output-lang">Hydrate your template</span>
          </div>
        </div>
        ${adapterTabs}
      </div>

      <!-- SVG OVERLAY: connection lines spanning the whole grid.
           viewBox + paths are recomputed at runtime against actual element rects
           so lines always anchor to source / build / adapter edges regardless
           of how the grid stretches. -->
      <svg class="flow-lines" aria-hidden="true" preserveAspectRatio="none">
        <path data-line="source-build" stroke="${G}" stroke-width="1.25" fill="none"/>
        <path data-line="build-client" stroke="${G}" stroke-width="1.25" fill="none"/>
        <circle data-dot="client" r="2.5" fill="${G}"/>
        ${ADAPTERS.map((_, i) => `<path
          class="flow-adapter-line"
          data-adapter-line="${i}"
          stroke="${i === 0 ? G : Dg}"
          stroke-width="${i === 0 ? 1.25 : 1}"
          stroke-dasharray="${i === 0 ? '' : '4,3'}"
          fill="none"
        /><circle
          class="flow-adapter-dot"
          data-adapter-dot="${i}"
          r="2.5"
          fill="${i === 0 ? G : Dg}"
        />`).join('')}
      </svg>
    </div>

    <script>
      (function () {
        var diagram = document.getElementById('flow-diagram');
        if (!diagram) return;
        var GREEN = '${G}';
        var GRAY = '${Dg}';
        var svg = diagram.querySelector('.flow-lines');
        var source = diagram.querySelector('.flow-source');
        var build = diagram.querySelector('.flow-build');
        var clientCard = diagram.querySelector('.flow-output-client');
        var adapterCards = diagram.querySelectorAll('.flow-adapter-tab');
        var sourceBuildPath = svg.querySelector('[data-line="source-build"]');
        var buildClientPath = svg.querySelector('[data-line="build-client"]');
        var clientDot = svg.querySelector('[data-dot="client"]');
        var adapterLines = svg.querySelectorAll('.flow-adapter-line');
        var adapterDots = svg.querySelectorAll('.flow-adapter-dot');
        var activeIdx = 0;

        function rect(el) {
          var g = diagram.getBoundingClientRect();
          var r = el.getBoundingClientRect();
          return {
            left: r.left - g.left,
            right: r.right - g.left,
            top: r.top - g.top,
            bottom: r.bottom - g.top,
            cx: r.left + r.width / 2 - g.left,
            cy: r.top + r.height / 2 - g.top,
          };
        }

        function elbowPath(x1, y1, x2, y2, viaX) {
          // Two right-angle bends: (x1,y1) → (viaX,y1) → (viaX,y2) → (x2,y2)
          return 'M ' + x1 + ' ' + y1 +
                 ' L ' + viaX + ' ' + y1 +
                 ' L ' + viaX + ' ' + y2 +
                 ' L ' + x2 + ' ' + y2;
        }

        function adapterPath(buildR, adapterCy, adapterLeft, _active) {
          // Single shared elbow x for all adapter lines, so the vertical
          // segments of active and inactive paths stack exactly on top of
          // each other instead of running side-by-side as a double rule.
          var gutter = adapterLeft - buildR.right;
          var viaX = buildR.right + gutter * 0.5;
          if (Math.abs(adapterCy - buildR.cy) < 1) {
            return 'M ' + buildR.right + ' ' + buildR.cy + ' L ' + adapterLeft + ' ' + adapterCy;
          }
          return elbowPath(buildR.right, buildR.cy, adapterLeft, adapterCy, viaX);
        }

        function update() {
          if (!source || !build || !clientCard) return;
          var grid = diagram.getBoundingClientRect();
          svg.setAttribute('viewBox', '0 0 ' + grid.width + ' ' + grid.height);
          var srcR = rect(source);
          // Position build node at the horizontal midpoint between source.right
          // and the adapter column's left edge, vertically centered on the source.
          var firstAdapter = adapterCards[0];
          var adapterLeft = firstAdapter
            ? rect(firstAdapter).left
            : rect(clientCard).left;
          var buildW = build.offsetWidth;
          var buildH = build.offsetHeight;
          var midX = (srcR.right + adapterLeft) / 2;
          build.style.left = (midX - buildW / 2) + 'px';
          build.style.top = (srcR.cy - buildH / 2) + 'px';
          var buildR = rect(build);
          var clientR = rect(clientCard);

          // source → build elbow (gutter mid)
          var leftGutterMid = (srcR.right + buildR.left) / 2;
          sourceBuildPath.setAttribute('d',
            elbowPath(srcR.right, srcR.cy, buildR.left, buildR.cy, leftGutterMid));

          // build → client.js (vertical out the top of build, then horizontal)
          buildClientPath.setAttribute('d',
            'M ' + buildR.cx + ' ' + buildR.top +
            ' L ' + buildR.cx + ' ' + clientR.cy +
            ' L ' + clientR.left + ' ' + clientR.cy);
          clientDot.setAttribute('cx', clientR.left);
          clientDot.setAttribute('cy', clientR.cy);

          // build → adapter cards
          adapterCards.forEach(function (card, i) {
            var aR = rect(card);
            adapterLines[i].setAttribute('d',
              adapterPath(buildR, aR.cy, aR.left, i === activeIdx));
            adapterDots[i].setAttribute('cx', aR.left);
            adapterDots[i].setAttribute('cy', aR.cy);
          });
        }

        function setActive(idx) {
          activeIdx = idx;
          adapterCards.forEach(function (t, i) {
            t.classList.toggle('is-active', i === idx);
            t.setAttribute('aria-pressed', i === idx ? 'true' : 'false');
          });
          adapterLines.forEach(function (l, i) {
            var active = i === idx;
            l.setAttribute('stroke', active ? GREEN : GRAY);
            l.setAttribute('stroke-width', active ? '1.25' : '1');
            l.setAttribute('stroke-dasharray', active ? '' : '4,3');
          });
          adapterDots.forEach(function (d, i) {
            d.setAttribute('fill', i === idx ? GREEN : GRAY);
          });
          update();
        }

        adapterCards.forEach(function (tab) {
          tab.addEventListener('click', function () {
            setActive(parseInt(tab.getAttribute('data-index') || '0', 10));
          });
        });

        update();
        window.addEventListener('resize', update);
        if (typeof ResizeObserver !== 'undefined') {
          var ro = new ResizeObserver(update);
          ro.observe(diagram);
        }
        // Re-run after fonts/images settle.
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(update);
        }
        window.addEventListener('load', update);
      })();
    </script>`
}

export async function Hero() {
  const diagramHtml = await buildDiagramHtml()

  return (
    <section className="hero-b">
      <div className="hero-b-content" dangerouslySetInnerHTML={{ __html: diagramHtml }} />
    </section>
  )
}
