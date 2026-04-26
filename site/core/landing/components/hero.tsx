/**
 * Hero section — Design B
 *
 *   source code → Barefoot build → client.js (always) + selectable adapter
 *
 * Stateless server component; the only stateful bits are the per-card
 * <Tooltip> instances (client component).
 */

import { highlight, initHighlighter } from './shared/highlighter'
import {
  SOURCE_CODE,
  HONO_OUTPUT,
  ECHO_OUTPUT,
  MOJO_OUTPUT,
  BROWSER_OUTPUT,
  CLIENT_CODE,
} from './shared/snippets'
import { Tooltip } from '@/components/ui/tooltip'

type Adapter = {
  id: string
  name: string
  lang: string
  /** Compiled template snippet shown in the Tooltip on hover/focus. */
  output: string
  // Either a logo url (svg in /static/logos/) or an inline svg string for icons
  // we don't have an asset for (Browser).
  logo?: string
  inlineIcon?: string
}

const BROWSER_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="9"/>
  <path d="M3 12h18"/>
  <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/>
</svg>`

const ADAPTERS: Adapter[] = [
  { id: 'hono',        name: 'Hono',        lang: 'TypeScript',            output: HONO_OUTPUT,    logo: '/static/logos/hono-icon.svg' },
  { id: 'echo',        name: 'Echo',        lang: 'Go',                    output: ECHO_OUTPUT,    logo: '/static/logos/echo-icon.png' },
  { id: 'mojolicious', name: 'Mojolicious', lang: 'Perl',                  output: MOJO_OUTPUT,    logo: '/static/logos/mojo-icon.png' },
  { id: 'browser',     name: 'Browser',     lang: 'Client Side Rendering', output: BROWSER_OUTPUT, inlineIcon: BROWSER_ICON },
]

const BAREFOOT_ICON = `<svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" class="flow-build-icon">
  <ellipse cx="18" cy="36" rx="9" ry="12" transform="rotate(-15 20 46)"/>
  <ellipse cx="38" cy="34" rx="7" ry="10" transform="rotate(-8 38 44)"/>
  <ellipse cx="54" cy="38" rx="6" ry="9" transform="rotate(0 54 50)"/>
  <ellipse cx="68" cy="46" rx="4.5" ry="7" transform="rotate(8 68 56)"/>
  <ellipse cx="80" cy="57" rx="3.5" ry="5.5" transform="rotate(15 80 60)"/>
</svg>`

const G = '#22c55e'
const Dg = 'rgba(34, 197, 94, 0.28)'

// Inline runtime: lays out the SVG connector lines against actual element
// rects so they stay attached to source / build / cards regardless of how
// the grid stretches, and switches between desktop horizontal flow and
// mobile vertical stack at the 820px breakpoint.
const FLOW_DIAGRAM_SCRIPT = `(function () {
  var diagram = document.getElementById('flow-diagram');
  if (!diagram) return;
  var GREEN = ${JSON.stringify(G)};
  var GRAY = ${JSON.stringify(Dg)};
  var svg = diagram.querySelector('.flow-lines');
  if (svg) svg.setAttribute('preserveAspectRatio', 'none');
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
    return 'M ' + x1 + ' ' + y1 +
           ' L ' + viaX + ' ' + y1 +
           ' L ' + viaX + ' ' + y2 +
           ' L ' + x2 + ' ' + y2;
  }
  function elbowPathV(x1, y1, x2, y2, viaY) {
    return 'M ' + x1 + ' ' + y1 +
           ' L ' + x1 + ' ' + viaY +
           ' L ' + x2 + ' ' + viaY +
           ' L ' + x2 + ' ' + y2;
  }
  function isMobile() {
    return window.matchMedia('(max-width: 820px)').matches;
  }
  function adapterPath(buildR, adapterCy, adapterLeft) {
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
    var mobile = isMobile();

    if (!mobile) {
      var firstAdapter = adapterCards[0];
      var adapterLeft = firstAdapter ? rect(firstAdapter).left : rect(clientCard).left;
      var buildW = build.offsetWidth;
      var buildH = build.offsetHeight;
      var gap = adapterLeft - srcR.right;
      var bias = gap > 700 ? 0.34 : gap > 500 ? 0.4 : 0.5;
      var midX = srcR.right + gap * bias;
      build.style.left = (midX - buildW / 2) + 'px';
      build.style.top = (srcR.cy - buildH / 2) + 'px';
    } else {
      build.style.left = '';
      build.style.top = '';
    }

    var buildR = rect(build);
    var clientR = rect(clientCard);

    if (mobile) {
      var sbViaY = (srcR.bottom + buildR.top) / 2;
      sourceBuildPath.setAttribute('d',
        elbowPathV(srcR.cx, srcR.bottom, buildR.cx, buildR.top, sbViaY));

      buildClientPath.setAttribute('d',
        'M ' + buildR.left + ' ' + buildR.cy +
        ' L ' + clientR.cx + ' ' + buildR.cy +
        ' L ' + clientR.cx + ' ' + clientR.top);
      clientDot.setAttribute('cx', clientR.cx);
      clientDot.setAttribute('cy', clientR.top);

      var minAdapterTop = Infinity;
      adapterCards.forEach(function (c) {
        var t = rect(c).top;
        if (t < minAdapterTop) minAdapterTop = t;
      });
      var busY = (buildR.bottom + minAdapterTop) / 2;

      adapterCards.forEach(function (card, i) {
        var aR = rect(card);
        adapterLines[i].setAttribute('d',
          elbowPathV(buildR.cx, buildR.bottom, aR.cx, aR.top, busY));
        adapterDots[i].setAttribute('cx', aR.cx);
        adapterDots[i].setAttribute('cy', aR.top);
      });
    } else {
      var leftGutterMid = (srcR.right + buildR.left) / 2;
      sourceBuildPath.setAttribute('d',
        elbowPath(srcR.right, srcR.cy, buildR.left, buildR.cy, leftGutterMid));

      buildClientPath.setAttribute('d',
        'M ' + buildR.cx + ' ' + buildR.top +
        ' L ' + buildR.cx + ' ' + clientR.cy +
        ' L ' + clientR.left + ' ' + clientR.cy);
      clientDot.setAttribute('cx', clientR.left);
      clientDot.setAttribute('cy', clientR.cy);

      adapterCards.forEach(function (card, i) {
        var aR = rect(card);
        adapterLines[i].setAttribute('d',
          adapterPath(buildR, aR.cy, aR.left));
        adapterDots[i].setAttribute('cx', aR.left);
        adapterDots[i].setAttribute('cy', aR.cy);
      });
    }
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

  // Single-open invariant: when the user opens one tooltip, close any
  // others that are currently open. We dispatch click() on the other
  // wrapper (which is what toggles the Tooltip's signal). A guard flag
  // breaks the recursion since the dispatched click fires this same
  // listener again.
  var tooltipWrappers = diagram.querySelectorAll('.flow-adapters [data-slot="tooltip"]');
  var suppressTooltipChain = false;
  tooltipWrappers.forEach(function (wrapper) {
    wrapper.addEventListener('click', function () {
      if (suppressTooltipChain) return;
      // Defer until after Tooltip's own click handler has applied the
      // toggle, so we observe the post-click state.
      setTimeout(function () {
        suppressTooltipChain = true;
        try {
          tooltipWrappers.forEach(function (other) {
            if (other === wrapper) return;
            var oc = other.querySelector('[data-slot="tooltip-content"]');
            if (oc && oc.getAttribute('data-state') === 'open') {
              other.click();
            }
          });
        } finally {
          suppressTooltipChain = false;
        }
      }, 0);
    });
  });

  // Mobile tooltip positioning: when a tooltip-content opens, pin it
  // (position: fixed) just below the .flow-adapters row, full width
  // minus margin. Avoids per-card centering that overflows the viewport
  // and avoids relying on offsetParent quirks that produced wrong
  // absolute coordinates with the wrapper-static layout hack.
  var adaptersRow = diagram.querySelector('.flow-adapters');
  function positionMobileTooltips() {
    if (!isMobile() || !adaptersRow) return;
    var rowRect = adaptersRow.getBoundingClientRect();
    var top = rowRect.bottom + 8;
    var contents = diagram.querySelectorAll('[data-slot="tooltip-content"]');
    contents.forEach(function (el) {
      el.style.position = 'fixed';
      el.style.top = top + 'px';
      el.style.left = '4vw';
      el.style.right = '4vw';
      el.style.bottom = 'auto';
      el.style.width = 'auto';
      el.style.maxWidth = 'none';
    });
  }
  function clearMobileTooltipStyles() {
    var contents = diagram.querySelectorAll('[data-slot="tooltip-content"]');
    contents.forEach(function (el) {
      el.style.position = '';
      el.style.top = '';
      el.style.left = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.width = '';
      el.style.maxWidth = '';
    });
  }
  function syncMobileTooltips() {
    if (isMobile()) positionMobileTooltips();
    else clearMobileTooltipStyles();
  }
  // Watch state changes so we re-pin when an open transition runs.
  var mo = new MutationObserver(syncMobileTooltips);
  diagram.querySelectorAll('[data-slot="tooltip-content"]').forEach(function (el) {
    mo.observe(el, { attributes: true, attributeFilter: ['data-state'] });
  });
  function refresh() { update(); syncMobileTooltips(); }
  refresh();
  window.addEventListener('resize', refresh);
  window.addEventListener('scroll', syncMobileTooltips, { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    var ro = new ResizeObserver(refresh);
    ro.observe(diagram);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(refresh);
  }
  window.addEventListener('load', refresh);
})();`

export async function Hero() {
  await initHighlighter()
  const codeHtml = highlight(SOURCE_CODE, 'tsx')

  return (
    <section className="hero-b">
      <div className="hero-b-content">
        <div className="hero-b-grid" id="flow-diagram">
          <div className="hero-b-left">
            <div className="hero-b-text">
              <h1 className="hero-b-heading fade-in">
                TSX in. <span className="hero-b-accent">Your template language out.</span>
              </h1>
              <p className="hero-b-body fade-in-1">
                Barefoot compiles signal-based TSX directly into <strong>Hono</strong>, <strong>Echo</strong>, or the browser.
                <br />
                No virtual DOM. No SPA required.
              </p>
              <div className="hero-b-buttons fade-in-2">
                <a href="/docs/introduction" className="btn-primary">Get Started</a>
                <a href="/playground" className="btn-secondary">Playground →</a>
              </div>
            </div>
            <div className="flow-source">
              <div className="flow-source-header">
                <div className="flow-source-header-left">
                  <span className="flow-source-dot"></span>
                  <span className="flow-source-filename">Counter.tsx</span>
                </div>
                <span className="flow-source-label">SOURCE</span>
              </div>
              <div className="flow-source-code">
                <pre
                  className="shiki shiki-themes github-light github-dark"
                  tabindex={0}
                  dangerouslySetInnerHTML={{ __html: `<code>${codeHtml}</code>` }}
                />
              </div>
            </div>
          </div>

          <div className="flow-build">
            <span dangerouslySetInnerHTML={{ __html: BAREFOOT_ICON }} />
            <img src="/static/logo-text.svg" alt="Barefoot.js" className="flow-build-logo-text" />
          </div>

          <div className="flow-adapters" role="tablist" aria-label="Output adapter">
            <Tooltip content={CLIENT_CODE} placement="left">
              <div className="flow-output flow-output-client" aria-label="client.js">
                <img src="/static/logos/javascript-icon.png" alt="" className="flow-adapter-logo" />
              </div>
            </Tooltip>
            {ADAPTERS.map((a, i) => (
              <Tooltip content={a.output} placement="left">
                <button
                  type="button"
                  className={`flow-output flow-adapter-tab${i === 0 ? ' is-active' : ''}`}
                  data-adapter={a.id}
                  data-index={String(i)}
                  aria-pressed={i === 0 ? 'true' : 'false'}
                  aria-label={`${a.name} — ${a.lang}`}
                >
                  {a.logo
                    ? <img src={a.logo} alt="" className="flow-adapter-logo" />
                    : a.inlineIcon
                      ? <span className="flow-adapter-logo flow-adapter-logo-inline" dangerouslySetInnerHTML={{ __html: a.inlineIcon }} />
                      : null}
                </button>
              </Tooltip>
            ))}
          </div>

          {/* preserveAspectRatio is set in the inline script (the SVG attribute
              isn't in our JSX type declarations). */}
          <svg className="flow-lines" aria-hidden="true">
            <path data-line="source-build" stroke={G} stroke-width="1.25" fill="none" />
            <path data-line="build-client" stroke={G} stroke-width="1.25" fill="none" />
            <circle data-dot="client" r="2.5" fill={G} />
            {ADAPTERS.map((_, i) => (
              <>
                <path
                  className="flow-adapter-line"
                  data-adapter-line={String(i)}
                  stroke={i === 0 ? G : Dg}
                  stroke-width={i === 0 ? '1.25' : '1'}
                  stroke-dasharray={i === 0 ? '' : '4,3'}
                  fill="none"
                />
                <circle
                  className="flow-adapter-dot"
                  data-adapter-dot={String(i)}
                  r="2.5"
                  fill={i === 0 ? G : Dg}
                />
              </>
            ))}
          </svg>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: FLOW_DIAGRAM_SCRIPT }} />
    </section>
  )
}
