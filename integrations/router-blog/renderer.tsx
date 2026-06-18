/**
 * Layout for the router-blog.
 *
 * The shell (`<header>` with its islands) lives OUTSIDE any region, so a
 * partial navigation never re-renders or re-hydrates it — the uptime clock
 * keeps climbing and the theme toggle keeps its state.
 *
 * Below it are **two sibling regions** (spec/router.md **v2**, master–detail):
 *
 *   - `<aside bf-region="nav:0">` — a persistent sidebar. Both pages render it
 *     with the same id and the same content, so its *owned content* never
 *     differs (the router's diff normalizes away the per-render `bf-s` scope
 *     ids) and it is left mounted — its `Sidebar` island keeps its state.
 *   - `<main bf-region="content:1">` — the swappable content. Only this region's
 *     children change between pages, so it is the one the router swaps.
 *
 * The ids are written by hand here because this layout is a plain Hono SSR
 * template, not a compiled component tree; in `bf build` output the `<Region>`
 * component lowers to the same deterministic `bf-region="<file scope>:<index>"`
 * ids. The runtime only needs them equal across page documents to match.
 *
 * `BfScripts` emits the runtime + island module scripts at body end; the
 * router reads those `<script type="module" src>` tags off each navigation
 * response to load any newly-required island before re-hydrating. The
 * `router-entry.js` bootstrap (seams + startRouter) is emitted last.
 */
import { jsxRenderer } from 'hono/jsx-renderer'
import { BfScripts } from '@barefootjs/hono/scripts'
import { ShellStats } from '@/components/ShellStats'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Sidebar } from '@/components/Sidebar'

const STATIC = '/static/components'

// `searchParams()` now lives in the single physical `@barefootjs/client/reactive`
// module (re-exported by every `@barefootjs/client*` entry), so the island and
// the bootstrap share ONE signal instance just by resolving the bare specifiers
// to the same `barefoot.js` — no extra `router/signals` shim is needed.
const importMap = JSON.stringify({
  imports: {
    '@barefootjs/client': `${STATIC}/barefoot.js`,
    '@barefootjs/client/runtime': `${STATIC}/barefoot.js`,
    '@barefootjs/client/reactive': `${STATIC}/barefoot.js`,
  },
})

export const renderer = jsxRenderer(({ children, title }) => {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ?? 'Barefoot Blog'}</title>
        <script type="importmap" dangerouslySetInnerHTML={{ __html: importMap }} />
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      </head>
      <body>
        <header className="shell">
          <a className="shell-brand" href="/">📰 Barefoot Blog</a>
          <div className="shell-island">
            <ShellStats />
            <ThemeToggle />
          </div>
        </header>
        <div className="layout">
          {/*
            Two sibling regions. The `bf-region` ids are written BY HAND here
            only because this layout is a plain Hono `jsxRenderer` template, not
            a `bf build`-compiled component tree — so the `<Region>` component
            (from `@barefootjs/client`) would not be lowered. In a compiled tree
            you write `<Region>{children}</Region>` and the compiler emits a
            deterministic `bf-region="<file-scope hash>:<index>"` id for you.
            The router matches regions by plain string equality, so these
            readable ids work identically — they only need to be the same across
            every page that renders this layout.
          */}
          <aside bf-region="nav:0">
            <Sidebar />
          </aside>
          <main bf-region="content:1">{children}</main>
        </div>
        <BfScripts />
        <script type="module" src={`${STATIC}/router-entry.js`} />
      </body>
    </html>
  )
})

const STYLES = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html[data-theme="light"] { color-scheme: light; }
  body { margin: 0; font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #0e1116; color: #e6edf3; }
  html[data-theme="light"] body { background: #f6f8fa; color: #1f2328; }
  a { color: #58a6ff; }
  .shell { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 24px; background: #161b22; border-bottom: 1px solid #30363d; }
  html[data-theme="light"] .shell { background: #fff; border-bottom-color: #d0d7de; }
  .shell-brand { font-weight: 700; font-size: 18px; text-decoration: none; color: inherit; }
  .shell-island, .shell-stats { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .chip { display: inline-flex; align-items: center; gap: 6px; background: #0d1117; border: 1px solid #30363d; border-radius: 999px; padding: 5px 12px; font-size: 13px; color: #9aa7b4; }
  html[data-theme="light"] .chip { background: #f6f8fa; border-color: #d0d7de; color: #57606a; }
  .chip b { color: #58a6ff; font-variant-numeric: tabular-nums; }
  .toggle { cursor: pointer; background: #0d1117; border: 1px solid #30363d; color: #e6edf3; border-radius: 999px; padding: 5px 12px; font-size: 13px; }
  html[data-theme="light"] .toggle { background: #f6f8fa; border-color: #d0d7de; color: #1f2328; }
  .layout { display: flex; gap: 28px; align-items: flex-start; max-width: 1000px; margin: 0 auto; padding: 32px 24px 80px; }
  .layout main { flex: 1; min-width: 0; }
  .layout aside { position: sticky; top: 78px; width: 210px; flex: none; }
  html[data-theme="light"] .sidebar { background: #fff; border-color: #d0d7de; }
  .sidebar { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 16px; }
  .sidebar-title { font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #8b949e; margin-bottom: 12px; }
  .sidebar-pin { cursor: pointer; width: 100%; background: #0d1117; border: 1px solid #30363d; color: #f2cc60; border-radius: 8px; padding: 8px 12px; font-size: 14px; font-variant-numeric: tabular-nums; }
  html[data-theme="light"] .sidebar-pin { background: #f6f8fa; border-color: #d0d7de; }
  .sidebar-note { font-size: 12px; color: #6e7681; margin: 12px 0 0; }
  @media (max-width: 720px) { .layout { flex-direction: column; } .layout aside { position: static; width: 100%; } }
  .page-title { font-size: 28px; margin: 0 0 6px; }
  .lede, .meta { color: #8b949e; }
  html[data-theme="light"] .lede, html[data-theme="light"] .meta { color: #57606a; }
  .meta { font-size: 13px; margin-bottom: 12px; }
  .lede { margin: 0 0 18px; }
  .controls, .tags { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
  .ctl-label { font-size: 13px; color: #6e7681; }
  .tag, .tag-inline, .sort { text-decoration: none; font-size: 13px; color: #9aa7b4; }
  .tag, .sort { border: 1px solid #30363d; border-radius: 999px; padding: 4px 11px; }
  .tag.on, .sort.on { background: #1f6feb; border-color: #1f6feb; color: #fff; }
  .tag-inline { color: #58a6ff; }
  .status { font-size: 13px; color: #8b949e; margin-bottom: 12px; min-height: 1.2em; font-variant-numeric: tabular-nums; }
  .sortable-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .sortable-list li { display: flex; align-items: center; gap: 10px; border: 1px solid #30363d; border-radius: 10px; background: #161b22; padding: 10px 14px; }
  html[data-theme="light"] .sortable-list li { background: #fff; border-color: #d0d7de; }
  .sortable-list li.pinned { border-color: #f2cc60; box-shadow: inset 3px 0 0 #f2cc60; }
  .pin { cursor: pointer; background: none; border: none; font-size: 16px; color: #f2cc60; padding: 0; line-height: 1; }
  .item-link { color: #e6edf3; text-decoration: none; font-weight: 600; font-size: 15px; }
  html[data-theme="light"] .item-link { color: #1f2328; }
  .item-link:hover { color: #58a6ff; }
  .item-meta { margin-left: auto; font-size: 12px; color: #6e7681; }
  .islands { display: flex; gap: 12px; align-items: center; margin: 4px 0 22px; }
  .island { font-size: 14px; }
  .island.like { cursor: pointer; background: #161b22; border: 1px solid #30363d; color: #f778ba; border-radius: 8px; padding: 6px 12px; }
  html[data-theme="light"] .island.like { background: #fff; border-color: #d0d7de; }
  .island.timer { color: #8b949e; font-variant-numeric: tabular-nums; }
  .island.player { display: inline-flex; align-items: center; gap: 6px; color: #3fb950; font-variant-numeric: tabular-nums; border: 1px solid #30363d; border-radius: 8px; padding: 4px 10px; }
  html[data-theme="light"] .island.player { border-color: #d0d7de; }
  .player-toggle { cursor: pointer; background: none; border: none; color: inherit; font-size: 14px; padding: 0; line-height: 1; }
  .prose p { margin: 0 0 18px; color: #d8e0e8; }
  html[data-theme="light"] .prose p { color: #424a53; }
  .back { display: inline-block; margin-bottom: 14px; text-decoration: none; font-size: 14px; }
  .pager { display: flex; justify-content: space-between; gap: 12px; margin-top: 32px; padding-top: 18px; border-top: 1px solid #30363d; }
  .pager-link { color: #58a6ff; text-decoration: none; font-weight: 600; font-size: 14px; max-width: 46%; }
  .pager-link.next { text-align: right; margin-left: auto; }
  .pager-link.disabled { color: #6e7681; }
`
