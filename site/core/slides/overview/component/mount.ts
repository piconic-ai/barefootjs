// 日記の talks/tetris/component/mount.ts を、複数コンポーネント向けに一般化したもの。
//
// レイアウトが置く`<div data-bf="Name" data-bf-props='{...}'>`をBarefootJSの
// `render()`で描画する。`peitho build`の配布ビューア・`peitho present`・
// peitho-studioのいずれも、layout HTMLの`<script type="module"
// src="assets/mount.js">`から読み込む(peitho v1.34.0以降、各ビューアが
// `innerHTML`で差し込んだlayoutの`<script>`を実行し直し、`src`を
// `assets/<hash>-mount.js`に書き換える — mizzy/peitho#529, #530)。
//
// 新しいスライドを見つける方法は、ビューアのDOM方式で2通りに分かれる:
// - light DOM(`peitho build`の配布ビューア。`canvas.innerHTML =
//   slides[next].html`で毎回差し込み直す): `document`への挿入をそのまま
//   `MutationObserver`で観測できる。
// - Shadow DOM(`peitho present` / peitho-studioのプレビュー): 各スライドは
//   別々のshadow rootにマウントされ、`document`レベルの探索・observeからは
//   一切見えない。代わりに、マウント・差し替えのたびにhost要素から発火する
//   `SHADOW_MOUNTED_EVENT`(`'peitho:shadow-mounted'`、`composed: true`)を
//   購読して`event.detail.root`(そのshadow root自身)を受け取る。
import { render } from '@barefootjs/client/runtime'

// import するだけで registerComponent が走る(CSR adapter のビルド出力)
import './components/Arcade.tsx'
import './components/Counter.tsx'
import './components/Rotator.tsx'
import './components/Compiler.tsx'
import './components/Trace.tsx'
import './components/Terminal.tsx'
import './components/Showcase.tsx'

// ビューアは document の click で左右ナビゲーション、keydown で Space/矢印
// ナビゲーションをする。部品の中のクリックや入力欄のタイプがスライド送りに
// ならないよう、マウント要素でバブリングを止める(BarefootJS のイベントは
// 要素に直接 addEventListener されるので、ここで止めても部品側には届く)。
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

// light DOM経路。
new MutationObserver(() => mountIn(document)).observe(document.documentElement, { childList: true, subtree: true })
mountIn(document)

// Shadow DOM経路。peithoのビューア(`packages/peitho-present/src/scripts.ts`、
// mizzy/peitho#530)とpeitho-studio(`dom/slideCanvas.ts`)は、スライドを
// マウントするたびにhostから`peitho:shadow-mounted`を発火し、同じ
// `{ root, key, index }`を`window.__peithoShadowRoots`にも積む。
// `peitho present`は全スライドのhostを1回の同期処理でまとめて接続するので、
// module読み込み(非同期)が終わって下のaddEventListenerが登録される頃には、
// 初回分のdispatchはとっくに終わっている ― 購読だけでは初回マウントを全部
// 取りこぼすので、このバックログを一度ドレインして拾う。
type ShadowMounted = { root: ParentNode; key: string; index: number }
const backlog = (window as Window & { __peithoShadowRoots?: ShadowMounted[] }).__peithoShadowRoots
for (const detail of backlog ?? []) mountIn(detail.root)
document.addEventListener('peitho:shadow-mounted', (event) => {
  const root = (event as CustomEvent<Partial<ShadowMounted>>).detail?.root
  if (root) mountIn(root)
})
