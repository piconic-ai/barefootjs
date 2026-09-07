import { $, createComponent, createEffect, createSignal, escapeAttr, escapeText, hydrate, lazySlots, mapArray, mountRowRoot, qsa } from '@barefootjs/client/runtime'


export function initNestedLoopOuterIndexReorder(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [groups, setGroups] = createSignal([
    { id: 1, items: [{ id: 11, label: 'one' }] },
    { id: 2, items: [{ id: 21, label: 'two' }] },
    { id: 3, items: [{ id: 31, label: 'three' }] },
  ])
  const rotate = () => {
    setGroups(prev => {
      const [first, ...rest] = prev
      return [...rest, first]
    })
  }

  const [_s0, _s4] = $(__scope, 's0', 's4')

  if (_s0) _s0.addEventListener('click', rotate)
  mapArray(() => groups(), _s4, (group, gi) => String(group.id), (group, gi, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<li data-key="${escapeAttr(group().id)}"><ul class="items" bf="s3"><!--bf-loop:l0-->${group().items.map((item) => `<li data-key-1="${escapeAttr(item.id)}" class="item"><span class="group-index"><!--bf:s1-->${escapeText(gi)}<!--/--></span><span class="label"><!--bf:s2-->${escapeText(item.label)}<!--/--></span></li>`).join('')}<!--bf-/loop:l0--></ul></li>`
      return __tpl.content.firstElementChild.cloneNode(true)
    })())
    // Reactive inner loop: group.items
    { const __ic1_0 = qsa(__el, '[bf="s3"]')
    if (__ic1_0) mapArray(() => group().items || [], __ic1_0, (item) => String(item.id), (item, __innerIdx1_0, __existing) => {
      let __innerEl1_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<li data-key-1="${escapeAttr(item().id)}" class="item"><span class="group-index"><!--bf:s1-->${escapeText(gi())}<!--/--></span><span class="label"><!--bf:s2-->${escapeText(item().label)}<!--/--></span></li>`; return __t.content.firstElementChild.cloneNode(true) })()
      __innerEl1_0.setAttribute('data-key-1', String(item().id))
      const __bfw_s1 = lazySlots(__innerEl1_0, [{ id: 's1', kind: 'text', path: [] }, { id: 's2', kind: 'text', path: [] }])
      createEffect(() => { __bfw_s1('s1', String(gi())) })
      createEffect(() => { __bfw_s1('s2', String(item().label)) })
      return __innerEl1_0
    }, 'l0', undefined, "data-key-1") }
    return __el
  }, 'l1')

}

hydrate('NestedLoopOuterIndexReorder', { init: initNestedLoopOuterIndexReorder, template: (_p) => `<div><button type="button" class="rotate" bf="s0"> Rotate </button><ul class="groups" bf="s4"><!--bf-loop:l1-->${([
    { id: 1, items: [{ id: 11, label: 'one' }] },
    { id: 2, items: [{ id: 21, label: 'two' }] },
    { id: 3, items: [{ id: 31, label: 'three' }] },
  ]).map((group, gi) => `<li data-key="${escapeAttr(group.id)}"><ul class="items" bf="s3"><!--bf-loop:l0-->${group.items.map((item) => `<li data-key-1="${escapeAttr(item.id)}" class="item"><span class="group-index"><!--bf:s1-->${escapeText(gi)}<!--/--></span><span class="label"><!--bf:s2-->${escapeText(item.label)}<!--/--></span></li>`).join('')}<!--bf-/loop:l0--></ul></li>`).join('')}<!--bf-/loop:l1--></ul></div>` })
export function NestedLoopOuterIndexReorder(_p, __bfKey) { return createComponent('NestedLoopOuterIndexReorder', _p, __bfKey) }
