import { $, createComponent, createQuery, escapeAttr, escapeText, http, hydrate, lazySlots, mapArrayLazy, textOrNode } from '@barefootjs/client/runtime'


export function initCreateQueryInitial(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [posts, fetchPosts] = createQuery(() => http.get('/api/posts'), { initial: _p.posts })

  const [_s2, _s1] = $(__scope, 's2', 's1')

  if (_s2) _s2.addEventListener('click', () => { fetchPosts() })
  const __tpl_l0 = document.createElement('template')
  __tpl_l0.innerHTML = `<li data-key=""><!--bf:s0--><!--/--></li>`
  const __lzp_l0 = [[0]]
  const __lzs_l0 = [{ id: 's0', kind: 'text', path: [] }]
  const __lzsc_l0 = [{ id: 's0', kind: 'text', path: __lzp_l0[0] }]
  mapArrayLazy(() => posts(), _s1, (post) => String(post.id), {
    createRow: (__e, __idx) => {
      const post = () => __e.item
      const __el = __tpl_l0.content.firstElementChild.cloneNode(true)
      const __r = __e.refs = [lazySlots(__el, __lzsc_l0)]
      const __l = __e.last = []
      { const __x = post().title
      __r[0]('s0', textOrNode(__x))
      __l[0] = __x }
      return __el
    },
    applyItem: (__e) => {
      const post = () => __e.item
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      const __d = __r[0] ?? (__r[0] = lazySlots(__e.primaryEl, __lzs_l0))
      { const __x = post().title
      if (!(0 in __l) || !Object.is(__l[0], __x)) __d('s0', textOrNode(__x))
      __l[0] = __x }
    },
  }, 'l0')

}

hydrate('CreateQueryInitial', { init: initCreateQueryInitial, template: (_p) => `<div><ul bf="s1"><!--bf-loop:l0-->${(_p.posts).map((post) => `<li data-key="${escapeAttr(post.id)}"><!--bf:s0-->${escapeText(post.title)}<!--/--></li>`).join('')}<!--bf-/loop:l0--></ul><button bf="s2">reload</button></div>` })
export function CreateQueryInitial(_p, __bfKey) { return createComponent('CreateQueryInitial', _p, __bfKey) }
