// 日記の talks/tetris/component/mount.ts を、複数コンポーネント向けに一般化したもの。
//
// peitho の配布ビューア(dist/index.html)はスライドを移動するたびに
// `canvas.innerHTML = slides[next].html` で差し込み直す(light DOM)。
// そのため <script> は動かないが、DOM の出現は MutationObserver で拾える。
// レイアウト HTML に置いた `<div data-bf="Name" data-bf-props='{...}'>` を
// 見つけるたびに BarefootJS の render() でその場に描画する。
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

function mountAll() {
  const targets = document.querySelectorAll<HTMLElement>('[data-bf]:not([data-mounted])')
  for (const el of targets) {
    el.dataset.mounted = '1'
    for (const type of STOP) el.addEventListener(type, (e) => e.stopPropagation())
    const name = el.dataset.bf!
    const props = el.dataset.bfProps ? JSON.parse(el.dataset.bfProps) : undefined
    render(el, name, props)
  }
}

new MutationObserver(mountAll).observe(document.documentElement, { childList: true, subtree: true })
mountAll()
