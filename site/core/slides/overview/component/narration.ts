// Deck chrome added to peitho's distribution viewer: a thin progress bar, a slide counter,
// previous/next buttons, a word-by-word rise for headlines, and the prefers-reduced-motion
// gate for the cover's looping clip. No narration, no captions, no auto-advance.
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
  #bf-progress { position: fixed; left: 0; right: 0; top: 0; height: 2px; z-index: 21; background: rgba(10,10,10,.06); }
  #bf-progress i { display: block; height: 100%; width: 0; background: #3fa45b; transition: width 600ms cubic-bezier(.2,.6,.2,1); }
  #bf-counter { position: fixed; right: 22px; bottom: 18px; z-index: 20; font: 400 12px/1 "DM Mono", ui-monospace, monospace; letter-spacing: .1em; color: #6e6e73; }
  #bf-nav { position: fixed; right: 18px; bottom: 40px; z-index: 20; display: flex; gap: 6px; }
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
// A slide on a dark ground marks its <section> with data-ground="dark"; the chrome follows.
function paintChrome() {
  const dark = !!document.querySelector('#peitho-canvas section[data-ground="dark"]')
  if (document.body.classList.contains('bf-dark') !== dark) document.body.classList.toggle('bf-dark', dark)
  const t = total(); const i = slideIndex()
  const [prev, next] = nav.querySelectorAll('button')
  if (prev.disabled !== (i <= 1)) prev.disabled = i <= 1
  if (next.disabled !== (t > 0 && i >= t)) next.disabled = t > 0 && i >= t
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
