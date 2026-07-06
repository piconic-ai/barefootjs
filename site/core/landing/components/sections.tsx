/**
 * Landing page sections 2–5 of the compiler-positioning LP (PR #2112):
 *
 *   2. The fork — "Two good answers. Now a third."
 *   3. Proof — component × adapter matrix rendered from ui/compat.lock.json
 *   4. Fit — "Is this for you?" (for / not for)
 *   5. Quickstart — `npm create barefootjs@latest`
 *
 * The matrix is REAL data: it renders the committed compat lock file
 * (the same source as /docs/advanced/compatibility-matrix), so the cells
 * on the LP can never drift from what CI actually verifies. Cells that
 * carry a tracked limitation render muted instead of being hidden — the
 * LP shows the same numbers CI reports, not an idealized 100%.
 */

import lock from '../../../../ui/compat.lock.json' with { type: 'json' }
import { QuickstartCopy } from '@/components/quickstart-copy'

interface CompatCell {
  ok: boolean
  diagnostics?: { code: string; severity: 'error' | 'warning' }[]
}

interface CompatLock {
  adapters: string[]
  components: Record<string, Record<string, CompatCell>>
}

const compat = lock as CompatLock

/* ── 2. The fork ─────────────────────────────────────────────── */

export function ForkSection() {
  return (
    <section className="lp-section">
      <div className="lp-wrap">
        <h2 className="lp-h2">Two good answers. Now a third.</h2>
        <p className="lp-lead">
          For interactive UI on a non-Node backend, two approaches serve teams well today.
          BarefootJS adds a third — for one specific situation: you want a component model,
          and you want to keep the backend you have.
        </p>
        <div className="fork">
          <div className="option">
            <span className="opt-label">Option 1</span>
            <h3>Server templates + Alpine or Stimulus</h3>
            <p>
              A great fit for light interactivity — simple, close to HTML, easy to adopt.
              As client state grows and needs to be shared, typed, and tested, keeping it
              organized takes more and more care.
            </p>
          </div>
          <div className="option">
            <span className="opt-label">Option 2</span>
            <h3>Adopt a JS meta-framework</h3>
            <p>
              Next.js and Remix offer an excellent component model, and they shine when a
              team runs JavaScript end to end. If your current backend is serving you well,
              though, getting there means a migration and a new runtime to operate.
            </p>
          </div>
          <div className="third">
            <span className="opt-label">With BarefootJS</span>
            <h3>Compile components into your templates</h3>
            <p>
              Typed props, signals, and composition when you write. Your own template engine
              when you serve. <b>Build-time type errors instead of runtime bug reports — and
              nothing new to operate.</b>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── 3. Proof (matrix) ───────────────────────────────────────── */

export function MatrixSection({ uiHref = 'https://ui.barefootjs.dev' }: { uiHref?: string }) {
  const componentNames = Object.keys(compat.components).sort()
  const adapters = compat.adapters
  const totalCells = componentNames.length * adapters.length
  let okCells = 0
  for (const name of componentNames) {
    for (const adapter of adapters) {
      if (compat.components[name]?.[adapter]?.ok) okCells++
    }
  }

  return (
    <section className="lp-section">
      <div className="lp-wrap">
        <h2 className="lp-h2">
          {componentNames.length} components × {adapters.length} adapters, verified in CI
        </h2>
        <p className="lp-lead">
          Every cell below is a real check that runs on every commit — not an illustration.
        </p>
        <div
          className="matrix"
          aria-label={`${componentNames.length} components by ${adapters.length} adapters, ${okCells} of ${totalCells} compiling clean`}
        >
          {adapters.map((adapter) => (
            <div className="matrix-row">
              <span className="rlabel">{adapter}</span>
              <div className="cells">
                {componentNames.map((name) => {
                  const ok = compat.components[name]?.[adapter]?.ok
                  return (
                    <span
                      className={`cell${ok ? '' : ' cell-miss'}`}
                      title={ok ? `${name} × ${adapter}` : `${name} × ${adapter} — tracked limitation`}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="matrix-foot">
          <span className="matrix-count">✓ {okCells} / {totalCells} passing</span>
          {okCells < totalCells && (
            <span className="matrix-miss-note">
              {totalCells - okCells} cells are tracked limitations
            </span>
          )}
          <a href={uiHref}>Browse all {componentNames.length} components →</a>
          <a href="/docs/advanced/compatibility-matrix">Full matrix →</a>
        </div>
      </div>
    </section>
  )
}

/* ── 4. For / not for ────────────────────────────────────────── */

export function FitSection() {
  return (
    <section className="lp-section">
      <div className="lp-wrap">
        <h2 className="lp-h2">Is this for you?</h2>
        <div className="fit">
          <div className="fit-col yes">
            <h3>Probably yes, if</h3>
            <ul>
              <li>Your backend is Go, Rails, Django, Perl, PHP, or Rust — and it's serving you well</li>
              <li>Your UI has outgrown sprinkles, but a Node migration isn't worth it</li>
              <li>You want UI that agents and CI can verify — structural tests in milliseconds, every CLI command speaks <code>--json</code></li>
            </ul>
          </div>
          <div className="fit-col no">
            <h3>Probably no, if</h3>
            <ul>
              <li>Next.js or Remix is working well for you — you already have a great component model</li>
              <li>You're building an app-like SPA: client routing, offline state, canvas editors</li>
              <li>Your pages have no interactivity — plain templates are already right</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── 5. Quickstart ───────────────────────────────────────────── */

export function QuickstartSection() {
  return (
    <section className="lp-section">
      <div className="lp-wrap">
        <h2 className="lp-h2">Try it in one command</h2>
        <p className="lp-lead">
          Scaffolds a working project — pick your language and framework in the prompt.
        </p>
        <div className="term">
          <span><span className="term-prompt">$</span> npm create barefootjs@latest</span>
          <QuickstartCopy command="npm create barefootjs@latest" />
        </div>
        <div className="lp-cta-row lp-cta-row-spaced">
          <a className="lp-btn lp-btn-primary" href="/docs/quick-start">Read the quickstart</a>
          <a className="lp-btn lp-btn-ghost" href="https://github.com/piconic-ai/barefootjs">Source on GitHub</a>
        </div>
      </div>
    </section>
  )
}
