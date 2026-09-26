import { $, __bfSlot, createComponent, createDisposableEffect, createQuery, escapeAttr, escapeText, http, hydrate, insert, lazySlots, mapArrayLazy, textOrNode } from '@barefootjs/client/runtime'


export function initCreateQueryOptionalInitial(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [posts] = createQuery(() => http.get('/api/posts'), { initial: _p.posts })

  const [_s0] = $(__scope, 's0')

  insert(__scope, 's0', () => !posts(), {
    template: () => { const __slots = []; return { html: `<p bf-c="s0" data-slot="skeleton">Loading…</p>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<ul bf-c="s0" bf="s2"><!--bf-loop:l0-->${posts().map((post) => `<li data-key="${escapeAttr(post.id)}"><!--bf:s1-->${__bfSlot(post.title, __slots)}<!--/--></li>`).join('')}<!--bf-/loop:l0--></ul>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const __disposers = []
      const [__loop_s2] = $(__branchScope, 's2')
      __disposers.push(createDisposableEffect(() => {
        const __lzs_l0 = [{ id: 's1', kind: 'text', path: [] }]
        if (__loop_s2) mapArrayLazy(() => posts(), __loop_s2, (post) => String(post.id), {
          createRow: (__e, __idx) => {
            const post = () => __e.item
            const __el = (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = `<li data-key="${escapeAttr(post().id)}"><!--bf:s1-->${escapeText(post().title)}<!--/--></li>`; return __tpl.content.firstElementChild.cloneNode(true) })()
            const __r = __e.refs = [lazySlots(__el, __lzs_l0)]
            const __l = __e.last = []
            { const __x = post().title
            __r[0]('s1', textOrNode(__x))
            __l[0] = __x }
            return __el
          },
          applyItem: (__e) => {
            const post = () => __e.item
            const __r = __e.refs ?? (__e.refs = [])
            const __l = __e.last ?? (__e.last = [])
            const __d = __r[0] ?? (__r[0] = lazySlots(__e.primaryEl, __lzs_l0))
            { const __x = post().title
            if (!(0 in __l) || !Object.is(__l[0], __x)) __d('s1', textOrNode(__x))
            __l[0] = __x }
          },
        }, 'l0')
      }))
      return () => __disposers.forEach(d => d())
    }
  })

}

hydrate('CreateQueryOptionalInitial', { init: initCreateQueryOptionalInitial, template: (_p) => `<div bf="s3">${!(_p.posts) ? `<p bf-c="s0" data-slot="skeleton">Loading…</p>` : `<ul bf-c="s0" bf="s2"><!--bf-loop:l0-->${(_p.posts).map((post) => `<li data-key="${escapeAttr(post.id)}"><!--bf:s1-->${escapeText(post.title)}<!--/--></li>`).join('')}<!--bf-/loop:l0--></ul>`}</div>` })
export function CreateQueryOptionalInitial(_p, __bfKey) { return createComponent('CreateQueryOptionalInitial', _p, __bfKey) }
