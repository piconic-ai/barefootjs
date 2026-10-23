import { $, createComponent, createEffect, createSignal, escapeText, escapeTextOrMarkup, escapeTextOrNode, hydrate, lazySlots } from '@barefootjs/client/runtime'


export function initHandlerWrittenLocals(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [log, setLog] = createSignal([])
  let nextId = 0
  let left = 'a'
  let right = 'b'
  const addPre = () => setLog([...log(), `#${++nextId}`])
  const addPost = () => setLog([...log(), `#${nextId++}`])
  const swap = () => {
    ;[left, right] = [right, left]
    setLog([...log(), left + right])
  }
  const addSum = () => {
    let total = 0
    for (let i = 0; i < 3; i++) total += i
    nextId += total
    setLog([...log(), `+${nextId}`])
  }

  const [_s0, _s1, _s2, _s3] = $(__scope, 's0', 's1', 's2', 's3')

  const __bfw_s4 = lazySlots(__scope, [{ id: 's4', kind: 'markup', path: [] }])
  createEffect(() => {
    const __val = log().join(' ')
    __bfw_s4('s4', escapeTextOrNode(__val))
  })

  if (_s0) _s0.addEventListener('click', addPre)
  if (_s1) _s1.addEventListener('click', addPost)
  if (_s2) _s2.addEventListener('click', swap)
  if (_s3) _s3.addEventListener('click', addSum)
}

hydrate('HandlerWrittenLocals', { init: initHandlerWrittenLocals, template: (_p) => `<div><button class="add-pre" bf="s0">pre</button><button class="add-post" bf="s1">post</button><button class="swap" bf="s2">swap</button><button class="add-sum" bf="s3">sum</button><p class="next">${escapeText((0))}</p><p class="log" bf="s5"><!--bf:s4-->${escapeTextOrMarkup(([]).join(' '))}<!--/--></p></div>` })
export function HandlerWrittenLocals(_p, __bfKey) { return createComponent('HandlerWrittenLocals', _p, __bfKey) }
