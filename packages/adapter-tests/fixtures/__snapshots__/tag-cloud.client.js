import { $, createComponent, createEffect, createSignal, escapeAttr, escapeText, hydrate, mapArray, patchLeaf } from '@barefootjs/client/runtime'


export function initTagCloud(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [items, setItems] = createSignal(_p.items ?? [])
  createEffect(() => {
    const __val = _p.items
    if (__val !== undefined) setItems(__val)
  })
  const [nextId, setNextId] = createSignal(100)
  const add = () => {
    const id = nextId()
    setNextId(id + 1)
    setItems([...items(), { id, label: `new & <fresh> #${id}`, tags: [`x "${id}"`] }])
  }
  const dropFirst = () => setItems(items().slice(1))
  const shout = () =>
    setItems(items().map(it => ({ ...it, label: it.label.toUpperCase() })))

  const [_s0, _s1, _s2, _s3] = $(__scope, 's0', 's1', 's2', 's3')

  if (_s0) _s0.addEventListener('click', add)
  if (_s1) _s1.addEventListener('click', dropFirst)
  if (_s2) _s2.addEventListener('click', shout)
  mapArray(() => (items()).flatMap((item) => {
          if (item.tags.length === 0) return []
          const prefix = item.label + ' — '
          return item.tags.map(tag => (
            ({ k: (`${item.id}:${tag}`), h: `<li ${(tag) != null ? 'data-tag="' + escapeAttr(tag) + '"' : ''}>${escapeText((prefix))}${escapeText((tag))}</li>` })
          ))
        }), _s3, (__bfD, __bfI) => String(__bfD.k ?? __bfI), (__bfD, __idx, __existing) => {
    let __el = __existing
    if (!__el) { const __tpl = document.createElement('template'); __tpl.innerHTML = __bfD().h; __el = __tpl.content.firstElementChild }
    let __last = __existing ? undefined : __bfD().h
    createEffect(() => {
      const __html = __bfD().h
      if (__last === undefined) { __last = __html; return }
      if (__html !== __last) { __last = __html; patchLeaf(__el, __html) }
    })
    return __el
  }, 'l0')

}

hydrate('TagCloud', { init: initTagCloud, template: (_p) => `<div class="tag-cloud"><button class="add" bf="s0">add</button><button class="drop" bf="s1">drop</button><button class="shout" bf="s2">shout</button><ul class="tags" bf="s3"><!--bf-loop:l0-->${(_p.items ?? []).flatMap((item) => {
          if (item.tags.length === 0) return []
          const prefix = item.label + ' — '
          return item.tags.map(tag => (
            `<li ${(tag) != null ? 'data-tag="' + escapeAttr(tag) + '"' : ''}>${escapeText((prefix))}${escapeText((tag))}</li>`
          ))
        }).join('')}<!--bf-/loop:l0--></ul></div>` })
export function TagCloud(_p, __bfKey) { return createComponent('TagCloud', _p, __bfKey) }
