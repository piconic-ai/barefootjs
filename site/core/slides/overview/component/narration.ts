// Deck chrome added to peitho's distribution viewer: a thin progress bar, a slide counter,
// previous/next buttons, a language toggle, a word-by-word rise for headlines, and the
// prefers-reduced-motion gate for the cover's looping clip. No narration, no captions, no
// auto-advance.
//
// Slides are identified by the data-slide-key peitho puts on each slide's root <section>.
const progress = document.createElement('div')
progress.id = 'bf-progress'
progress.innerHTML = '<i></i>'
document.body.append(progress)
const counter = document.createElement('div')
counter.id = 'bf-counter'
document.body.append(counter)

// Previous / next buttons, bottom-right next to the counter. The viewer navigates by
// keyboard and by clicking the canvas, but a slide that owns the keyboard (the arcade)
// or the pointer (the component page) leaves no obvious way out; these always work.
// Navigation goes through the URL the viewer already treats as canonical: write
// ?slide=N and raise popstate, which the viewer answers with showSlide().
const nav = document.createElement('div')
nav.id = 'bf-nav'
nav.innerHTML = '<button type="button" data-dir="-1" aria-label="Previous slide">&#8249;</button><button type="button" data-dir="1" aria-label="Next slide">&#8250;</button>'
document.body.append(nav)
// Language toggle. build-slides.ts builds deck.<lang>.md into <lang>/ and installs a head
// shim that serves those files to the viewer when localStorage("bf-lang") names a language
// (window.__BF_LANGS lists what was built, window.__BF_LANG what is active). Switching means
// reloading: the viewer loads every slide at boot. The URL does not change.
const LANGS: string[] = (window as any).__BF_LANGS ?? []
const activeLang: string = (window as any).__BF_LANG ?? 'en'
const langs = document.createElement('div')
langs.id = 'bf-langs'
if (LANGS.length > 0) {
  const all = ['en', ...LANGS]
  langs.innerHTML = all.map((l) => `<button type="button" data-lang="${l}"${l === activeLang ? ' aria-current="true"' : ''}>${l.toUpperCase()}</button>`).join('')
  document.body.append(langs)
  langs.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-lang]')
    if (!b || b.dataset.lang === activeLang) return
    e.stopPropagation()
    try { if (b.dataset.lang === 'en') localStorage.removeItem('bf-lang'); else localStorage.setItem('bf-lang', b.dataset.lang!) } catch {}
    location.reload()
  })
}
nav.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-dir]')
  if (!b) return
  e.stopPropagation() // not a canvas click for the viewer
  const next = Math.min(Math.max(slideIndex() + Number(b.dataset.dir), 1), total() || slideIndex() + 1)
  const params = new URLSearchParams(location.search)
  params.set('slide', String(next))
  history.pushState(null, '', `${location.pathname}?${params}${location.hash}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
})

const style = document.createElement('style')
style.textContent = `
  /* All chrome is anchored to the 16:9 canvas (see placeChrome), never to the viewport, so it
     stays inside the slide on a letterboxed screen and scales with it. */
  #bf-progress { position: fixed; left: 0; top: 0; width: 0; height: 2px; z-index: 21; background: rgba(10,10,10,.06); }
  #bf-progress i { display: block; height: 100%; width: 0; background: #3fa45b; transition: width 600ms cubic-bezier(.2,.6,.2,1); }
  #bf-counter { position: fixed; left: 0; top: 0; z-index: 20; transform-origin: top left; font: 400 12px/1 "DM Mono", ui-monospace, monospace; letter-spacing: .1em; color: #6e6e73; white-space: nowrap; }
  #bf-nav { position: fixed; left: 0; top: 0; z-index: 20; transform-origin: top left; display: flex; gap: 6px; }
  #bf-langs { position: fixed; left: 0; top: 0; z-index: 20; transform-origin: top left; display: flex; border: 1px solid rgba(10,10,10,.18); border-radius: 999px; overflow: hidden; background: rgba(255,255,255,.55); backdrop-filter: blur(6px); }
  #bf-langs button { font: 500 11px/1 "DM Mono", ui-monospace, monospace; letter-spacing: .12em; padding: 10px 11px 9px; border: 0; background: transparent; color: #6e6e73; cursor: pointer; transition: background 160ms ease, color 160ms ease; }
  #bf-langs button[aria-current="true"] { background: #0a0a0a; color: #fff; cursor: default; }
  #bf-langs button:not([aria-current]):hover { color: #0a0a0a; }
  #bf-langs button:focus-visible { outline: 2px solid #3fa45b; outline-offset: -2px; }
  body.bf-dark #bf-langs { border-color: rgba(255,255,255,.28); background: rgba(255,255,255,.08); }
  body.bf-dark #bf-langs button { color: rgba(255,255,255,.6); }
  body.bf-dark #bf-langs button[aria-current="true"] { background: #fff; color: #0a0a0a; }
  body.bf-dark #bf-langs button:not([aria-current]):hover { color: #fff; }
  #bf-nav button {
    width: 34px; height: 34px; padding: 0 0 2px; border-radius: 50%; border: 1px solid rgba(10,10,10,.18);
    background: rgba(255,255,255,.55); color: #0a0a0a; font: 400 22px/1 "Instrument Sans", -apple-system, sans-serif;
    cursor: pointer; backdrop-filter: blur(6px); transition: background 160ms ease, border-color 160ms ease, opacity 200ms ease;
  }
  #bf-nav button:hover { background: #0a0a0a; color: #fff; border-color: #0a0a0a; }
  #bf-nav button:focus-visible { outline: 2px solid #3fa45b; outline-offset: 2px; }
  #bf-nav button:disabled { opacity: .3; cursor: default; }
  body.bf-dark #bf-nav button { border-color: rgba(255,255,255,.28); background: rgba(255,255,255,.08); color: #fff; }
  body.bf-dark #bf-nav button:hover { background: #fff; color: #0a0a0a; border-color: #fff; }
  body.bf-dark #bf-counter { color: rgba(255,255,255,.55); }
  /* Compact chrome (phones, any coarse-pointer screen): the counter, the language toggle and
     the page buttons leave the canvas and dock into a bar fixed to the bottom of the viewport,
     at thumb size and unscaled — on a 390px-wide phone the canvas-anchored chrome would be a
     third of its size, unusable. See placeChrome(). */
  #bf-bar {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px;
    padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px));
    background: rgba(251,250,247,.88); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border-top: 1px solid rgba(10,10,10,.08);
  }
  #bf-bar #bf-counter, #bf-bar #bf-nav, #bf-bar #bf-langs { position: static; transform: none; }
  #bf-bar #bf-counter { grid-column: 2; font-size: 13px; text-align: center; }
  #bf-bar #bf-langs { grid-column: 1; justify-self: start; }
  #bf-bar #bf-langs button { font-size: 13px; padding: 0 18px; height: 44px; }
  #bf-bar #bf-nav { grid-column: 3; justify-self: end; gap: 10px; }
  #bf-bar #bf-nav button { width: 48px; height: 48px; font-size: 28px; }
  body.bf-dark #bf-progress { background: rgba(255,255,255,.12); }`
document.head.append(style)

function currentKey(): string | null {
  return document.querySelector<HTMLElement>('#peitho-canvas section[data-slide-key]')?.dataset.slideKey ?? null
}
function slideIndex(): number {
  return Number(new URLSearchParams(location.search).get('slide') ?? '1')
}
function total(): number {
  return Number(document.body.dataset.bfTotal ?? '0')
}

function splitHeadline() {
  const h = document.querySelector<HTMLElement>('#peitho-canvas .slot-title')
  if (!h || h.dataset.split) return
  h.dataset.split = '1'
  if (currentKey() === 'cover') return // the wordmark stays whole
  // Wrap each word in a span, keeping inline markup (<em> for the green word) in place:
  // only text nodes are split, so "Compile, *don't run*." keeps its emphasis.
  let n = 0
  const wrap = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const frag = document.createDocumentFragment()
      const words = (node.textContent ?? '').split(' ')
      words.forEach((w, i) => {
        if (w) {
          const s = document.createElement('span')
          s.className = 'hl-word'
          s.style.setProperty('--w', String(n++))
          s.textContent = w
          frag.append(s)
        }
        if (i < words.length - 1) frag.append(' ')
      })
      node.parentNode?.replaceChild(frag, node)
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      for (const child of Array.from(node.childNodes)) wrap(child)
    }
  }
  for (const child of Array.from(h.childNodes)) wrap(child)
}
// WCAG 2.2.2: a looping background clip must not be forced on people who asked for reduced
// motion. The <video> in layouts/cover.html carries `autoplay` so it plays without this
// script; here, when the OS/browser preference is set, the clip is stopped before it starts
// and stripped of its sources, so only the poster frame (assets/hero.jpg) is shown and the
// 16 MB file is never requested. Re-checked on every slide swap because the viewer
// re-inserts the slide HTML each time.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
function gateVideo() {
  if (!reducedMotion.matches) return
  for (const v of document.querySelectorAll<HTMLVideoElement>('#peitho-canvas video[autoplay]')) {
    v.removeAttribute('autoplay')
    v.removeAttribute('loop')
    v.pause()
    for (const source of v.querySelectorAll('source')) source.remove()
    v.removeAttribute('src')
    v.load() // no source left: the element settles on its poster
  }
}
function paintProgress() {
  const t = total(); const i = slideIndex()
  if (!t) return
  const w = `${(i / t) * 100}%`
  const bar = progress.querySelector('i')!
  if (bar.style.width !== w) bar.style.width = w
  const label = `${String(i).padStart(2, '0')} / ${String(t).padStart(2, '0')}`
  // Only write on change: this runs from a MutationObserver, and an unconditional
  // textContent write is itself a mutation (infinite loop, measured).
  if (counter.textContent !== label) counter.textContent = label
}
// Chrome geometry, in canvas units (1280x720): the counter sits 22px from the right edge and
// 18px from the bottom, the buttons right above it. Layouts keep their content clear of that
// corner (base.css's bottom padding; the arcade's caption sits above it).
const CANVAS_W = 1280, CANVAS_H = 720
const COUNTER_RIGHT = 22, COUNTER_BOTTOM = 18, NAV_BOTTOM = 40, NAV_RIGHT = 18
// Phones and other touch screens: dock the chrome into a bottom bar instead (#bf-bar above).
// Width alone catches a phone in portrait; the pointer clause catches a phone in landscape
// and a tablet, where the canvas-scaled buttons would still be too small to tap.
const compactQuery = matchMedia('(max-width: 820px), (hover: none) and (pointer: coarse)')
// Narrow screens only (a phone in portrait) also get the phone-shaped canvas and the
// single-column, larger-type layouts (body.bf-compact in the CSS). A tablet or a phone in
// landscape keeps the desktop layout: at their scale the 16:9 slide is still legible, and
// the tall canvas would not fit their height anyway.
const narrowQuery = matchMedia('(max-width: 820px)')
const bar = document.createElement('div')
bar.id = 'bf-bar'
function dockChrome(compact: boolean) {
  const narrow = narrowQuery.matches
  if (document.body.classList.contains('bf-compact') !== narrow) document.body.classList.toggle('bf-compact', narrow)
  if (compact) {
    if (!bar.isConnected) document.body.append(bar)
    for (const el of [langs, counter, nav]) {
      if (el === langs && LANGS.length === 0) continue
      if (el.parentElement !== bar) bar.append(el)
      el.style.left = el.style.top = el.style.transform = ''
    }
  } else if (bar.isConnected) {
    for (const el of [counter, nav, langs]) if (el.parentElement === bar) document.body.append(el)
    bar.remove()
  }
}
// Fit the canvas into the viewport minus `bottomInset` (the bar's height on compact screens,
// 0 otherwise): the same translate+scale the viewer's own fit writes, so on desktop this is a
// no-op restatement. Always re-done here, in both modes, because compactQuery can flip
// without a resize (a mouse attached to or detached from a touchscreen) and the viewer's
// fit only runs on resize — relying on it would leave the last compact fit on the canvas.
//
// On narrow screens the canvas also stops being 16:9: it keeps its 1280-unit width and grows
// to the viewport's own proportion (a phone in portrait gets a canvas around 1280x2500), so
// the single-column, larger-type layouts under body.bf-compact have room to flow. The height
// rides on --peitho-canvas-height, which .peitho-slide already reads. A slide that declares
// data-canvas="fixed" (the arcade: its play field is authored in 1280x720 coordinates) keeps
// the 16:9 canvas.
function fitCanvas(canvas: HTMLElement, narrow: boolean, bottomInset: number) {
  const avail = innerHeight - bottomInset
  const fixed = !!canvas.querySelector('section[data-canvas="fixed"]')
  const ch = narrow && !fixed ? Math.max(CANVAS_H, Math.round(CANVAS_W * avail / innerWidth)) : CANVAS_H
  const hpx = `${ch}px`
  if (canvas.style.height !== hpx) {
    canvas.style.height = hpx
    document.documentElement.style.setProperty('--peitho-canvas-height', hpx)
  }
  const s = Math.min(innerWidth / CANVAS_W, avail / ch)
  const w = CANVAS_W * s, h = ch * s
  canvas.style.transform = `translate(${(innerWidth - w) / 2}px, ${(avail - h) / 2}px) scale(${s})`
}
function placeChrome() {
  const canvas = document.getElementById('peitho-canvas')
  if (!canvas) return
  const compact = compactQuery.matches
  dockChrome(compact)
  fitCanvas(canvas, narrowQuery.matches, compact ? bar.offsetHeight : 0)
  const r = canvas.getBoundingClientRect()
  if (compact) {
    progress.style.left = `${r.left}px`; progress.style.top = `${r.top}px`; progress.style.width = `${r.width}px`
    return
  }
  const s = r.width / CANVAS_W
  const put = (el: HTMLElement, x: number, y: number) => {
    el.style.left = `${r.left + x * s}px`
    el.style.top = `${r.top + y * s}px`
    el.style.transform = `scale(${s})`
  }
  progress.style.left = `${r.left}px`
  progress.style.top = `${r.top}px`
  progress.style.width = `${r.width}px`
  // offsetWidth is the layout size, unaffected by the transform: canvas units already
  put(counter, CANVAS_W - COUNTER_RIGHT - counter.offsetWidth, CANVAS_H - COUNTER_BOTTOM - 12)
  put(nav, CANVAS_W - NAV_RIGHT - nav.offsetWidth, CANVAS_H - NAV_BOTTOM - 34)
  if (langs.isConnected) put(langs, CANVAS_W - NAV_RIGHT - nav.offsetWidth - 10 - langs.offsetWidth, CANVAS_H - NAV_BOTTOM - 34 + (34 - langs.offsetHeight) / 2)
}
window.addEventListener('resize', placeChrome)
compactQuery.addEventListener('change', placeChrome)
narrowQuery.addEventListener('change', placeChrome)

// A slide on a dark ground marks its <section> with data-ground="dark"; the chrome follows.
function paintChrome() {
  // Docked in the bottom bar the chrome sits outside the canvas, on the page's own ground,
  // so a dark slide does not flip it there.
  const dark = !compactQuery.matches && !!document.querySelector('#peitho-canvas section[data-ground="dark"]')
  if (document.body.classList.contains('bf-dark') !== dark) document.body.classList.toggle('bf-dark', dark)
  const t = total(); const i = slideIndex()
  const [prev, next] = nav.querySelectorAll('button')
  if (prev.disabled !== (i <= 1)) prev.disabled = i <= 1
  if (next.disabled !== (t > 0 && i >= t)) next.disabled = t > 0 && i >= t
  placeChrome()
}
function check() {
  if (currentKey()) { gateVideo(); splitHeadline(); paintProgress(); paintChrome() }
}

// total slides: from the inlined manifest when present, else from manifest.json next to the page
const m = (window as any).__BF_MANIFEST
if (m?.slides) document.body.dataset.bfTotal = String(m.slides.length)
else fetch('manifest.json').then(r => r.json()).then(mm => { document.body.dataset.bfTotal = String(mm.slides.length); check() }).catch(() => {})
new MutationObserver(() => check()).observe(document.getElementById('peitho-canvas') ?? document.body, { childList: true, subtree: true })
check()
export {}
