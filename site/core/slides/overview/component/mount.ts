// Generalized from the diary repo's talks/tetris/component/mount.ts to mount
// several components.
//
// Renders each `<div data-bf="Name" data-bf-props='{...}'>` a layout places
// with BarefootJS's `render()`. `peitho build`'s distribution viewer,
// `peitho present`, and peitho-studio all load this module from the layout
// HTML's `<script type="module" src="assets/mount.js">` (since peitho
// v1.34.0, each viewer re-executes a layout's `<script>` injected via
// `innerHTML` and rewrites its `src` to `assets/<hash>-mount.js` —
// mizzy/peitho#529, #530).
//
// How a new slide is discovered depends on how the viewer holds its DOM:
// - Light DOM (`peitho build`'s distribution viewer, which re-injects via
//   `canvas.innerHTML = slides[next].html` on every navigation): insertions
//   into `document` are observable with a plain `MutationObserver`.
// - Shadow DOM (`peitho present` / peitho-studio's preview): each slide is
//   mounted into its own shadow root, invisible to any `document`-level
//   query or observer. Instead, listen for `'peitho:shadow-mounted'`
//   (`composed: true`), fired from the host on every mount or swap, and take
//   `event.detail.root` (that shadow root itself).
import { render } from '@barefootjs/client/runtime'

// Importing is enough to run registerComponent (the CSR adapter's build output).
import './components/Arcade.tsx'
import './components/Counter.tsx'
import './components/Rotator.tsx'
import './components/Compiler.tsx'
import './components/Trace.tsx'
import './components/Terminal.tsx'
import './components/Showcase.tsx'

// The viewer navigates on a `document` click (left/right) and on keydown
// (Space/arrows). Stop bubbling at the mount element so a click inside a
// component or typing into its input never advances the slide (BarefootJS
// attaches its own listeners directly to elements, so they still fire).
const STOP = ['click', 'keydown', 'keyup', 'mousedown', 'touchstart', 'touchend'] as const

function mountIn(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-bf]:not([data-mounted])')) {
    el.dataset.mounted = '1'
    for (const type of STOP) el.addEventListener(type, (e) => e.stopPropagation())
    const name = el.dataset.bf!
    const props = el.dataset.bfProps ? JSON.parse(el.dataset.bfProps) : undefined
    render(el, name, props)
  }
}

// Light DOM path.
new MutationObserver(() => mountIn(document)).observe(document.documentElement, { childList: true, subtree: true })
mountIn(document)

// Shadow DOM path. peitho's viewers (`packages/peitho-present/src/scripts.ts`,
// mizzy/peitho#530) and peitho-studio (`dom/slideCanvas.ts`) fire
// `peitho:shadow-mounted` from the host on every slide mount, and also push
// the same `{ root, key, index }` onto `window.__peithoShadowRoots`.
// `peitho present` connects every slide's host in one synchronous pass, so
// by the time this module has loaded (asynchronously) and registered the
// listener below, those first dispatches are long over — listening alone
// would miss every initial mount, so drain the backlog once first.
type ShadowMounted = { root: ParentNode; key: string; index: number }
const backlog = (window as Window & { __peithoShadowRoots?: ShadowMounted[] }).__peithoShadowRoots
for (const detail of backlog ?? []) mountIn(detail.root)
document.addEventListener('peitho:shadow-mounted', (event) => {
  const root = (event as CustomEvent<Partial<ShadowMounted>>).detail?.root
  if (root) mountIn(root)
})
