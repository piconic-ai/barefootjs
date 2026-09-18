// 日記の talks/tetris/component/mount.ts を、複数コンポーネント向けに一般化したもの。
//
// レイアウトが置く`<div data-bf="Name" data-bf-props='{...}'>`をBarefootJSの
// `render()`で描画する。このmodule自体は必ず「本物のscript」として静的に
// 読み込む必要がある — スライドのフラグメントHTMLに直接書いた`<script>`は
// HTML仕様上(`innerHTML`でパースされたものは実行されない)動かないため。
// `peitho build`の配布ビューアにはbuild-slides.tsがindex.htmlのheadへ注入し、
// `peitho present`/peitho-studioはlayout HTMLの`<script type="module"
// src="assets/mount.js">`から読み込む(いずれもpeitho/peitho-studio側の
// "re-execute injected script"対応が前提 — 参照:
// piconic-ai/peitho-studio の todo/layout-js-console-log.md)。
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

// Shadow DOM経路。`peitho present`(`packages/peitho-present/src/shell.ts`)は
// 全スライドのhostを1回の同期処理でまとめて接続するので、module読み込み
// (非同期)が終わって下のaddEventListenerが登録される頃には、初回分の
// dispatchはとっくに終わっている ― 購読だけでは初回マウントを全部取りこぼす。
// `window.__peithoShadowRoots`はその対策としてshell.tsが積んでおくバックログ
// 配列で、ここで一度ドレインして取りこぼし分を拾う。peitho-studio
// (`dom/slideCanvas.ts`)は1枚ずつ遅延マウントするので購読だけで間に合う。
const backlog = (window as Window & { __peithoShadowRoots?: ParentNode[] }).__peithoShadowRoots
for (const root of backlog ?? []) mountIn(root)
document.addEventListener('peitho:shadow-mounted', (event) => {
  const root = (event as CustomEvent<{ root?: ParentNode }>).detail?.root
  if (root) mountIn(root)
})
