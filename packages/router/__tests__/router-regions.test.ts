/**
 * @barefootjs/router v2 — compiler-derived nested / sibling regions (table-driven).
 *
 * Each case declares the live document and the incoming page, then its
 * expectations: which live nodes `survives` the navigation (their region was
 * not swapped) vs are `replaced` (swapped/rebuilt), the `textAfter`, whether it
 * `fallsBackToReload`, and the `committedPath`. The runner auto-tags every node
 * an expectation names so it can tell a surviving live node from a freshly
 * rendered one of the same id. `islandMutates` runs after the router captured
 * its baseline, to simulate an island changing the live DOM. Markup inside a
 * region is written compactly (no inter-element whitespace): both pages come
 * from the same compiler, so a region's markup is byte-identical except for real
 * changes and the per-render scope ids the diff already normalizes away.
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register({ url: 'https://example.test/a' })
  }
  if (typeof window.scrollTo !== 'function') {
    ;(window as unknown as { scrollTo: () => void }).scrollTo = () => {}
  }
})

const { startRouter, navigate } = await import('../src/index.ts')

let router: { stop(): void } | null = null
let assigned = ''
let realAssign: typeof window.location.assign
const flush = (ms = 10) => new Promise((r) => setTimeout(r, ms))

const MARK = 1
const tag = (id: string) => {
  const el = document.getElementById(id) as (HTMLElement & { __k?: number }) | null
  if (el) el.__k = MARK
}
const marker = (id: string) =>
  (document.getElementById(id) as (HTMLElement & { __k?: number }) | null)?.__k

function setURL(url: string): void {
  const happy = (globalThis as unknown as { happyDOM?: { setURL?: (u: string) => void } }).happyDOM
  if (happy?.setURL) happy.setURL(url)
  else window.history.replaceState(window.history.state, '', url)
}

/** Wrap region/shell markup in a full HTML document. */
function fullDoc(body: string, title = 'p'): string {
  return `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`
}

function mockFetch(html: string): void {
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) =>
    ({
      ok: true,
      status: 200,
      redirected: false,
      url: String(input),
      text: async () => html,
    }) as unknown as Response) as typeof fetch
}

beforeEach(() => {
  setURL('https://example.test/a')
  assigned = ''
  realAssign = window.location.assign
  ;(window.location as unknown as { assign: (u: string) => void }).assign = (u: string) => {
    assigned = u
  }
  ;(window as unknown as { __bf_dispose_within?: (r: Element) => void }).__bf_dispose_within = () => {}
})

afterEach(() => {
  router?.stop()
  router = null
  ;(window.location as unknown as { assign: typeof realAssign }).assign = realAssign
  delete (window as unknown as Record<string, unknown>).__bf_dispose_within
})

interface RegionCase {
  /** What this case demonstrates. */
  name: string
  /** The live document, before navigating. */
  current: string
  /** The full page the navigation fetches. */
  incoming: string

  // ── optional setup ──
  /** After the router captured its baseline, an island mutates the live DOM. */
  islandMutates?: () => void

  // ── expectations (every id listed here is auto-tracked by node identity) ──
  /** These live nodes must SURVIVE the navigation — their region was not swapped. */
  survives?: string[]
  /** These live nodes must be REPLACED — their region was swapped / rebuilt. */
  replaced?: string[]
  /** Expected `textContent` after the navigation, by element id. */
  textAfter?: Record<string, string>
  /** The navigation should fall back to a full page reload, not a partial swap. */
  fallsBackToReload?: boolean
  /** The pathname the navigation committed to history (a partial swap does). */
  committedPath?: string
}

const cases: RegionCase[] = [
  {
    name: 'sibling regions: only the one whose content differs swaps',
    current:
      `<header>shell</header>` +
      `<div bf-region="r:0" id="list"><p id="list-item">list A</p></div>` +
      `<div bf-region="r:1" id="detail"><p id="detail-body">detail A</p></div>`,
    incoming:
      `<div bf-region="r:0" id="list"><p id="list-item">list A</p></div>` +
      `<div bf-region="r:1" id="detail"><p id="detail-body">detail B</p></div>`,
    survives: ['list-item'],
    textAfter: { 'detail-body': 'detail B' },
  },
  {
    name: 'sibling regions: both swap when both differ',
    current:
      `<header>shell</header>` +
      `<div bf-region="r:0" id="list"><p id="list-item">list A</p></div>` +
      `<div bf-region="r:1" id="detail"><p id="detail-body">detail A</p></div>`,
    incoming:
      `<div bf-region="r:0" id="list"><p id="list-item">list B</p></div>` +
      `<div bf-region="r:1" id="detail"><p id="detail-body">detail B</p></div>`,
    replaced: ['list-item'],
    textAfter: { 'list-item': 'list B', 'detail-body': 'detail B' },
  },
  {
    name: 'nested regions: only the inner swaps; the outer shell persists',
    current:
      `<div bf-region="r:0" id="outer"><p id="outer-own">shell</p>` +
      `<div bf-region="r:1" id="inner"><p id="inner-body">inner A</p></div></div>`,
    incoming:
      `<div bf-region="r:0" id="outer"><p id="outer-own">shell</p>` +
      `<div bf-region="r:1" id="inner"><p id="inner-body">inner B</p></div></div>`,
    survives: ['outer-own'],
    textAfter: { 'inner-body': 'inner B' },
  },
  {
    name: 'nested regions: an outer change rebuilds the outer (inner rides along)',
    current:
      `<div bf-region="r:0" id="outer"><p id="outer-own">shell A</p>` +
      `<div bf-region="r:1" id="inner"><p id="inner-body">inner A</p></div></div>`,
    incoming:
      `<div bf-region="r:0" id="outer"><p id="outer-own">shell B</p>` +
      `<div bf-region="r:1" id="inner"><p id="inner-body">inner A</p></div></div>`,
    replaced: ['outer-own', 'inner-body'],
    textAfter: { 'outer-own': 'shell B' },
  },
  {
    name: 'a header change outside every region is ignored (the shell persists)',
    current:
      `<header id="hdr">old header</header>` +
      `<div bf-region="r:0" id="region"><p id="body">same</p></div>`,
    // Incoming has a DIFFERENT header but an identical region. The router only
    // swaps regions, so the (out-of-region) header is left as-is and the region
    // is not swapped — everything outside a region persists across a navigation.
    incoming:
      `<header id="hdr">new header</header>` +
      `<div bf-region="r:0" id="region"><p id="body">same</p></div>`,
    survives: ['body'],
    textAfter: { hdr: 'old header', body: 'same' },
    committedPath: '/b',
  },
  {
    name: 'a region whose island mutated the DOM is not swapped when the server render is unchanged',
    current: `<header>shell</header><div bf-region="r:0" id="region"><p id="body">server</p></div>`,
    incoming: `<div bf-region="r:0" id="region"><p id="body">server</p></div>`,
    // The diff compares the incoming SERVER render against the baseline server
    // render, not the live DOM, so the region stays mounted with its mutation.
    islandMutates: () => {
      const el = document.getElementById('body')
      if (el) el.textContent = 'mutated by island'
    },
    survives: ['body'],
    textAfter: { body: 'mutated by island' },
  },
  {
    name: 'a region differing only by a per-render island scope id is not swapped',
    current:
      `<header>shell</header>` +
      `<aside bf-region="nav:0" id="nav"><div class="w" bf-s="Widget_aaa111" bf-r=""><span id="w-state">keep</span></div></aside>` +
      `<main bf-region="content:1" id="main"><p id="body">A</p></main>`,
    incoming:
      `<aside bf-region="nav:0" id="nav"><div class="w" bf-s="Widget_zzz999" bf-r=""><span id="w-state">keep</span></div></aside>` +
      `<main bf-region="content:1" id="main"><p id="body">B</p></main>`,
    survives: ['w-state'],
    textAfter: { body: 'B' },
  },
  {
    // The Go template adapter carries props in a `bf-p` attribute whose
    // `scopeID` is regenerated per server render. The diff must blank it (like
    // the bf-s case above) or the sidebar region swaps away its state.
    name: 'a region differing only by a per-render scopeID inside bf-p is not swapped',
    current:
      `<header>shell</header>` +
      `<aside bf-region="nav:0" id="nav"><div class="sidebar" bf-r="" bf-p='{"scopeID":"Sidebar_aaa111","pins":0}'><span id="sb-state">keep</span></div></aside>` +
      `<main bf-region="content:1" id="main"><p id="body">A</p></main>`,
    incoming:
      `<aside bf-region="nav:0" id="nav"><div class="sidebar" bf-r="" bf-p='{"scopeID":"Sidebar_zzz999","pins":0}'><span id="sb-state">keep</span></div></aside>` +
      `<main bf-region="content:1" id="main"><p id="body">B</p></main>`,
    survives: ['sb-state'],
    textAfter: { body: 'B' },
  },
  {
    // ...but a genuine prop change in bf-p (pins 0 → 5) must still swap: only
    // the scopeID is volatile, every other prop stays in the comparison.
    name: 'a region whose bf-p props really changed (not just scopeID) is swapped',
    current:
      `<header>shell</header>` +
      `<aside bf-region="nav:0" id="nav"><div class="sidebar" bf-r="" bf-p='{"scopeID":"Sidebar_aaa111","pins":0}'><span id="sb-state">old</span></div></aside>` +
      `<main bf-region="content:1" id="main"><p id="body">A</p></main>`,
    incoming:
      `<aside bf-region="nav:0" id="nav"><div class="sidebar" bf-r="" bf-p='{"scopeID":"Sidebar_zzz999","pins":5}'><span id="sb-state">new</span></div></aside>` +
      `<main bf-region="content:1" id="main"><p id="body">B</p></main>`,
    replaced: ['sb-state'],
    textAfter: { body: 'B' },
  },
  {
    name: 'a navigation that changes no region commits history without swapping',
    current: `<header>shell</header><div bf-region="r:0" id="region"><p id="body">same</p></div>`,
    incoming: `<div bf-region="r:0" id="region"><p id="body">same</p></div>`,
    survives: ['body'],
    textAfter: { body: 'same' },
    committedPath: '/b',
  },
  {
    name: 'sibling region set diverges (Region + Region → Region + div): hard-navigates',
    current:
      `<header>shell</header>` +
      `<aside bf-region="nav:0" id="nav"><p id="np">N</p></aside>` +
      `<main bf-region="content:1" id="main"><p id="mp">A</p></main>`,
    // The incoming page lost its second region (now a plain <div>), so the id
    // sets don't match and there is no single root region containing the others.
    // A single broadest swap would half-update the page, so the router hard-
    // navigates instead (never worse than an MPA).
    incoming:
      `<aside bf-region="nav:0" id="nav"><p id="np">N</p></aside>` +
      `<div id="plain"><p id="mp">B</p></div>`,
    fallsBackToReload: true,
    textAfter: { mp: 'A' }, // no partial swap happened
  },
  {
    name: 'nested region set diverges but a root contains all: the root rebuilds',
    current:
      `<header>shell</header>` +
      `<div bf-region="r:0" id="outer"><p id="oo">shell</p>` +
      `<div bf-region="r:1" id="inner"><p id="ii">A</p></div></div>`,
    // The inner region's id changed (r:1 → r:9), so the sets diverge — but the
    // outer region is a root containing it, so swapping the outer rebuilds all.
    incoming:
      `<div bf-region="r:0" id="outer"><p id="oo">shell</p>` +
      `<div bf-region="r:9" id="inner"><p id="ii">B</p></div></div>`,
    replaced: ['oo', 'ii'],
    textAfter: { ii: 'B' },
  },
]

describe('@barefootjs/router v2 — nested / sibling regions', () => {
  for (const c of cases) {
    test(c.name, async () => {
      document.body.innerHTML = c.current
      mockFetch(fullDoc(c.incoming))
      router = startRouter({ rehydrate: () => {}, dispose: () => {} })
      c.islandMutates?.()
      // Tag every node an expectation refers to, so we can tell a surviving live
      // node from a freshly rendered one of the same id after the navigation.
      for (const id of [...(c.survives ?? []), ...(c.replaced ?? [])]) tag(id)

      await navigate('/b')
      await flush()

      if (c.fallsBackToReload) expect(assigned).toContain('/b')
      else expect(assigned).toBe('')
      for (const id of c.survives ?? []) expect(marker(id)).toBe(MARK)
      for (const id of c.replaced ?? []) expect(marker(id)).toBeUndefined()
      for (const [id, t] of Object.entries(c.textAfter ?? {})) {
        expect(document.getElementById(id)?.textContent).toBe(t)
      }
      if (c.committedPath) expect(window.location.pathname).toBe(c.committedPath)
    })
  }
})
