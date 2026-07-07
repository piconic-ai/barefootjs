/**
 * Hero section — "TSX in. Your stack out." + the input/output demo.
 *
 * The demo panels come from shared/demo-outputs.ts so the right-hand
 * side always shows what the compiler actually produces — never
 * hand-written approximations. Two manual pickers — example (left
 * pane) × adapter (right pane) — and never any auto-rotation.
 */

import { highlight, initHighlighter } from './shared/highlighter'
import { DEMO_EXAMPLES } from './shared/demo-outputs'

// Manual switching for the demo via two native <select>s: the active
// example (left source pane) and the active adapter (right output
// pane); the visible output panel is always example × adapter.
// Progressive enhancement: without JS the first example/adapter stays
// visible. No auto-rotation.
const DEMO_TABS_SCRIPT = `(function(){
  var frame = document.querySelector('.demo-frame');
  if (!frame) return;
  var exSelect = frame.querySelector('select[data-select="example"]');
  var adSelect = frame.querySelector('select[data-select="adapter"]');
  var srcPanels = Array.prototype.slice.call(frame.querySelectorAll('.src-panel'));
  var outPanels = Array.prototype.slice.call(frame.querySelectorAll('.out-panel'));

  function apply() {
    var example = exSelect.value;
    var adapter = adSelect.value;
    srcPanels.forEach(function(p){ p.classList.toggle('active', p.dataset.example === example); });
    outPanels.forEach(function(p){ p.classList.toggle('active', p.dataset.panel === example + '-' + adapter); });
  }

  if (exSelect) exSelect.addEventListener('change', apply);
  if (adSelect) adSelect.addEventListener('change', apply);
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

  return (
    <div className="lp-demo" id="how">
      <div className="lp-wrap">
        <div className="demo-frame">
          <div className="pane">
            <div className="pane-head">
              <span>what you write</span>
              <select className="demo-select" data-select="example" aria-label="Example source">
                {DEMO_EXAMPLES.map((ex, i) => (
                  <option value={ex.id} selected={i === 0}>{ex.file}</option>
                ))}
              </select>
            </div>
            {DEMO_EXAMPLES.map((ex, i) => (
              <div className={`src-panel${i === 0 ? ' active' : ''}`} data-example={ex.id}>
                <pre
                  className="shiki shiki-themes github-light github-dark"
                  tabindex={0}
                  dangerouslySetInnerHTML={{ __html: `<code>${highlight(ex.source, 'tsx')}</code>` }}
                />
              </div>
            ))}
          </div>
          <div className="pane">
            <div className="pane-head">
              <span>what your server renders</span>
              <select className="demo-select" data-select="adapter" aria-label="Compiled output language">
                {DEMO_EXAMPLES[0].outputs.map((out, i) => (
                  <option value={out.id} selected={i === 0}>{out.label}</option>
                ))}
              </select>
            </div>
            {DEMO_EXAMPLES.map((ex, i) =>
              ex.outputs.map((out, j) => (
                <div
                  className={`out-panel${i === 0 && j === 0 ? ' active' : ''}`}
                  data-panel={`${ex.id}-${out.id}`}
                >
                  <div className="pane-file-row">{out.file}</div>
                  <pre tabindex={0}><code>{out.code}</code></pre>
                </div>
              ))
            )}
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
