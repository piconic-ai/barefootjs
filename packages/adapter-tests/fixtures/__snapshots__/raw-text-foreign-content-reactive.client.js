import { createComponent, hydrate, markupOrEmpty, $, $c, createEffect, createSignal, escapeRawTextContent, escapeTextOrMarkup, escapeTextOrNode, initChild, lazySlots, renderChild } from '@barefootjs/client/runtime'

function initFrame() {}

hydrate('Frame__3701041c', { init: initFrame, template: (_p) => `<svg class="frame">${markupOrEmpty(_p.children)}</svg>`, name: 'Frame' })
export function Frame(_p, __bfKey) { return createComponent('Frame__3701041c', _p, __bfKey) }
export function initRawTextForeignContentReactive(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [n, setN] = createSignal(1)

  const [_s3] = $(__scope, 's3')
  const [_s0] = $c(__scope, 's0')

  const __bfw_s1 = lazySlots(__scope, [{ id: 's1', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = 'after' + n()
    __bfw_s1('s1', escapeTextOrNode(__val))
  })

  if (_s3) _s3.addEventListener('click', () => setN(n() + 1))

  // Initialize child components with props
  initChild('Frame__3701041c', _s0, {})
}

hydrate('RawTextForeignContentReactive', { init: initRawTextForeignContentReactive, template: (_p) => `<div>${renderChild('Frame__3701041c', {children: `<style class="css">${escapeRawTextContent('style', [('<img class="pwn"><i class="pwn"></style><!--<?x <![CDATA[.z < 1')])}</style><script class="js" type="text/plain">${escapeRawTextContent('script', [('<'), ('img class="pwn"></script><a class="pwn">&quot;&'), ('#60;img class="pwn">&amp;')])}</script>`}, undefined, 's0')}<b class="after" bf="s2"><!--bf:s1-->${escapeTextOrMarkup('after' + (1))}<!--/--></b><button class="go" bf="s3">go</button></div>` })
export function RawTextForeignContentReactive(_p, __bfKey) { return createComponent('RawTextForeignContentReactive', _p, __bfKey) }
