/**
 * Hero section — "TSX in. Your stack out." + the input/output demo.
 *
 * Layout and copy follow design/lp-mock/barefootjs-lp-v3.html. The demo
 * panels come from shared/demo-outputs.ts so the right-hand side always
 * shows what the compiler actually produces (see design/LP-RENEWAL.md,
 * 決定事項 6). Tab switching is manual only — no auto-rotation
 * (決定事項 7).
 */

import { highlight, initHighlighter } from './shared/highlighter'
import { DEMO_SOURCE, DEMO_OUTPUTS } from './shared/demo-outputs'

// Manual tab switching for the compiled-output panels. Progressive
// enhancement: without JS the first panel stays visible.
const DEMO_TABS_SCRIPT = `(function(){
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.demo-frame .tab'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.demo-frame .out-panel'));
  tabs.forEach(function(t){
    t.addEventListener('click', function(){
      tabs.forEach(function(x){ x.setAttribute('aria-selected', String(x === t)); });
      panels.forEach(function(p){ p.classList.toggle('active', p.dataset.panel === t.dataset.out); });
    });
  });
})();`

export function Hero({ uiHref = 'https://ui.barefootjs.dev' }: { uiHref?: string }) {
  return (
    <div className="lp-hero">
      <div className="lp-wrap">
        <h1 className="lp-h1">
          TSX in. <em>Your stack</em> out.
        </h1>
        <p className="lp-hero-sub">
          BarefootJS compiles TSX components into your backend's own templates —{' '}
          <strong>Go, Rails, Django, Perl, PHP, Rust</strong>. Your server renders them.
          A small hydration runtime (~14&nbsp;kB gzipped) makes them interactive. Node never ships.
        </p>
        <div className="lp-cta-row">
          <a className="lp-btn lp-btn-primary" href="/docs/quick-start">Get started</a>
          <a className="lp-btn lp-btn-ghost" href={uiHref}>Browse 62 components</a>
        </div>
      </div>
    </div>
  )
}

export async function DemoSection() {
  await initHighlighter()
  const sourceHtml = highlight(DEMO_SOURCE, 'tsx')

  return (
    <div className="lp-demo" id="how">
      <div className="lp-wrap">
        <div className="demo-frame">
          <div className="pane">
            <div className="pane-head">
              <span>what you write</span>
              <span className="pane-file">Counter.tsx</span>
            </div>
            <pre
              className="shiki shiki-themes github-light github-dark"
              tabindex={0}
              dangerouslySetInnerHTML={{ __html: `<code>${sourceHtml}</code>` }}
            />
          </div>
          <div className="pane">
            <div className="pane-head">
              <span>what your server renders</span>
              <div className="tabs" role="tablist" aria-label="Compiled output">
                {DEMO_OUTPUTS.map((out, i) => (
                  <button
                    className="tab"
                    role="tab"
                    aria-selected={i === 0 ? 'true' : 'false'}
                    data-out={out.id}
                    type="button"
                  >
                    {out.label}
                  </button>
                ))}
              </div>
            </div>
            {DEMO_OUTPUTS.map((out, i) => (
              <div className={`out-panel${i === 0 ? ' active' : ''}`} data-panel={out.id}>
                <div className="pane-file-row">{out.file}</div>
                <pre tabindex={0}><code>{out.code}</code></pre>
              </div>
            ))}
          </div>
        </div>
        <p className="demo-note">
          It's a compiler, not a framework. TSX and type-checking exist at build time,
          like a Sass compiler. At runtime there is only your template engine and one
          small <code>~14&nbsp;kB</code> hydration script.
        </p>
      </div>
      <script dangerouslySetInnerHTML={{ __html: DEMO_TABS_SCRIPT }} />
    </div>
  )
}
