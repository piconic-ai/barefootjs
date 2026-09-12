// Deck chrome added to peitho's distribution viewer: a thin progress bar, a slide counter,
// a word-by-word rise for headlines, and the prefers-reduced-motion gate for the cover's
// looping clip. No narration, no captions, no auto-advance.
//
// Slides are identified by the data-slide-key peitho puts on each slide's root <section>.
const progress = document.createElement('div')
progress.id = 'bf-progress'
progress.innerHTML = '<i></i>'
document.body.append(progress)
const counter = document.createElement('div')
counter.id = 'bf-counter'
document.body.append(counter)

const style = document.createElement('style')
style.textContent = `
  #bf-progress { position: fixed; left: 0; right: 0; top: 0; height: 2px; z-index: 21; background: rgba(10,10,10,.06); }
  #bf-progress i { display: block; height: 100%; width: 0; background: #3fa45b; transition: width 600ms cubic-bezier(.2,.6,.2,1); }
  #bf-counter { position: fixed; right: 22px; bottom: 18px; z-index: 20; font: 400 12px/1 "DM Mono", ui-monospace, monospace; letter-spacing: .1em; color: #6e6e73; }`
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
function check() {
  if (currentKey()) { gateVideo(); splitHeadline(); paintProgress() }
}

// total slides: from the inlined manifest when present, else from manifest.json next to the page
const m = (window as any).__BF_MANIFEST
if (m?.slides) document.body.dataset.bfTotal = String(m.slides.length)
else fetch('manifest.json').then(r => r.json()).then(mm => { document.body.dataset.bfTotal = String(mm.slides.length); check() }).catch(() => {})
new MutationObserver(() => check()).observe(document.getElementById('peitho-canvas') ?? document.body, { childList: true, subtree: true })
check()
export {}
