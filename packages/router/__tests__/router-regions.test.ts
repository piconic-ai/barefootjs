/**
 * @barefootjs/router v2 — compiler-derived nested / sibling regions (table-driven).
 *
 * Each case sets up the live document and the incoming page, tags live nodes
 * with an identity marker, navigates, then asserts which regions were
 * **preserved** (marker survives → not swapped) vs **replaced** (marker gone →
 * swapped/rebuilt), the resulting text, and whether the router fell back to a
 * hard navigation. `mutate` runs after the router captured its baseline, to
 * simulate an island changing the live DOM. Markup inside a region is written
 * compactly (no inter-element whitespace): both pages come from the same
 * compiler, so a region's markup is byte-identical except for real changes and
 * the per-render scope ids the diff already normalizes away.
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
  name: string
  /** Live document body (regions + any shell). */
  current: string
  /** Incoming fetched page body. */
  incoming: string
  /** Live element ids to tag with an identity marker before navigating. */
  tag?: string[]
  /** Runs after `startRouter` (baseline captured) — e.g. an island mutating the DOM. */
  mutate?: () => void
  /** Ids whose live node must SURVIVE the navigation (region not swapped). */
  preserved?: string[]
  /** Ids whose live node must be REPLACED (region swapped/rebuilt). */
  replaced?: string[]
  /** Expected `textContent` by element id after the navigation. */
  text?: Record<string, string>
  /** Expect a hard navigation (full reload) instead of any swap. */
  hardNavigate?: boolean
  /** Expect this committed pathname (a swap commits history). */
  path?: string
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
    tag: ['list-item'],
    preserved: ['list-item'],
    text: { 'detail-body': 'detail B' },
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
    tag: ['list-item'],
    replaced: ['list-item'],
    text: { 'list-item': 'list B', 'detail-body': 'detail B' },
  },
  {
    name: 'nested regions: only the inner swaps; the outer shell persists',
    current:
      `<div bf-region="r:0" id="outer"><p id="outer-own">shell</p>` +
      `<div bf-region="r:1" id="inner"><p id="inner-body">inner A</p></div></div>`,
    incoming:
      `<div bf-region="r:0" id="outer"><p id="outer-own">shell</p>` +
      `<div bf-region="r:1" id="inner"><p id="inner-body">inner B</p></div></div>`,
    tag: ['outer-own'],
    preserved: ['outer-own'],
    text: { 'inner-body': 'inner B' },
  },
  {
    name: 'nested regions: an outer change rebuilds the outer (inner rides along)',
    current:
      `<div bf-region="r:0" id="outer"><p id="outer-own">shell A</p>` +
      `<div bf-region="r:1" id="inner"><p id="inner-body">inner A</p></div></div>`,
    incoming:
      `<div bf-region="r:0" id="outer"><p id="outer-own">shell B</p>` +
      `<div bf-region="r:1" id="inner"><p id="inner-body">inner A</p></div></div>`,
    tag: ['outer-own', 'inner-body'],
    replaced: ['outer-own', 'inner-body'],
    text: { 'outer-own': 'shell B' },
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
    tag: ['body'],
    preserved: ['body'],
    text: { hdr: 'old header', body: 'same' },
    path: '/b',
  },
  {
    name: 'a region whose island mutated the DOM is not swapped when the server render is unchanged',
    current: `<header>shell</header><div bf-region="r:0" id="region"><p id="body">server</p></div>`,
    incoming: `<div bf-region="r:0" id="region"><p id="body">server</p></div>`,
    // Simulate a signal-driven island mutating the live DOM after hydration; the
    // diff compares the incoming SERVER render against the baseline server render,
    // not the live DOM, so the region stays mounted with its mutation intact.
    mutate: () => {
      const el = document.getElementById('body')
      if (el) el.textContent = 'mutated by island'
    },
    tag: ['body'],
    preserved: ['body'],
    text: { body: 'mutated by island' },
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
    tag: ['w-state'],
    preserved: ['w-state'],
    text: { body: 'B' },
  },
  {
    name: 'a navigation that changes no region commits history without swapping',
    current: `<header>shell</header><div bf-region="r:0" id="region"><p id="body">same</p></div>`,
    incoming: `<div bf-region="r:0" id="region"><p id="body">same</p></div>`,
    tag: ['body'],
    preserved: ['body'],
    text: { body: 'same' },
    path: '/b',
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
    tag: ['mp'],
    hardNavigate: true,
    text: { mp: 'A' }, // no partial swap happened
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
    tag: ['oo', 'ii'],
    replaced: ['oo', 'ii'],
    text: { ii: 'B' },
  },
]

describe('@barefootjs/router v2 — nested / sibling regions', () => {
  for (const c of cases) {
    test(c.name, async () => {
      document.body.innerHTML = c.current
      mockFetch(fullDoc(c.incoming))
      router = startRouter({ rehydrate: () => {}, dispose: () => {} })
      c.mutate?.()
      for (const id of c.tag ?? []) tag(id)

      await navigate('/b')
      await flush()

      if (c.hardNavigate) expect(assigned).toContain('/b')
      else expect(assigned).toBe('')
      for (const id of c.preserved ?? []) expect(marker(id)).toBe(MARK)
      for (const id of c.replaced ?? []) expect(marker(id)).toBeUndefined()
      for (const [id, t] of Object.entries(c.text ?? {})) {
        expect(document.getElementById(id)?.textContent).toBe(t)
      }
      if (c.path) expect(window.location.pathname).toBe(c.path)
    })
  }
})
