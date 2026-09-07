import { $, createComponent, createEffect, createSignal, escapeAttr, escapeText, hydrate, lazySlots, mapArray, mountRowRoot, qsa } from '@barefootjs/client/runtime'


export function initNestedLoopIndependentSignal(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [rows] = createSignal([
    { id: 1, label: 'Alpha' },
    { id: 2, label: 'Bravo' },
  ])
  const [tags, setTags] = createSignal(['a', 'b'])
  const addTag = () => {
    setTags(prev => [...prev, String.fromCharCode(97 + prev.length)])
  }

  const [_s0, _s4] = $(__scope, 's0', 's4')

  if (_s0) _s0.addEventListener('click', addTag)
  mapArray(() => rows(), _s4, (row) => String(row.id), (row, __idx, __existing) => {
    const __el = __existing ?? mountRowRoot((() => {
      const __tpl = document.createElement('template')
      __tpl.innerHTML = `<li data-key="${escapeAttr(row().id)}"><span class="label"><!--bf:s1-->${escapeText(row().label)}<!--/--></span><ul class="tags" bf="s3"><!--bf-loop:l0-->${tags().map((t) => `<li data-key-1="${escapeAttr(t)}" class="tag"><!--bf:s2-->${escapeText(t)}<!--/--></li>`).join('')}<!--bf-/loop:l0--></ul></li>`
      return __tpl.content.firstElementChild.cloneNode(true)
    })())
    // Reactive inner loop: tags()
    { const __ic1_0 = qsa(__el, '[bf="s3"]')
    if (__ic1_0) mapArray(() => tags() || [], __ic1_0, (t) => String(t), (t, __innerIdx1_0, __existing) => {
      let __innerEl1_0 = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = `<li data-key-1="${escapeAttr(t())}" class="tag"><!--bf:s2-->${escapeText(t())}<!--/--></li>`; return __t.content.firstElementChild.cloneNode(true) })()
      __innerEl1_0.setAttribute('data-key-1', String(t()))
      const __bfw_s2 = lazySlots(__innerEl1_0, [{ id: 's2', kind: 'text', path: [] }])
      createEffect(() => { __bfw_s2('s2', String(t())) })
      return __innerEl1_0
    }, 'l0', undefined, "data-key-1") }
    const __bfw_s1 = lazySlots(__el, [{ id: 's1', kind: 'text', path: [] }])
    createEffect(() => { __bfw_s1('s1', String(row().label)) })
    return __el
  }, 'l1')

}

hydrate('NestedLoopIndependentSignal', { init: initNestedLoopIndependentSignal, template: (_p) => `<div><button type="button" class="add-tag" bf="s0"> Add tag </button><ul class="rows" bf="s4"><!--bf-loop:l1-->${([
    { id: 1, label: 'Alpha' },
    { id: 2, label: 'Bravo' },
  ]).map((row) => `<li data-key="${escapeAttr(row.id)}"><span class="label"><!--bf:s1-->${escapeText(row.label)}<!--/--></span><ul class="tags" bf="s3"><!--bf-loop:l0-->${(['a', 'b']).map((t) => `<li data-key-1="${escapeAttr(t)}" class="tag"><!--bf:s2-->${escapeText(t)}<!--/--></li>`).join('')}<!--bf-/loop:l0--></ul></li>`).join('')}<!--bf-/loop:l1--></ul></div>` })
export function NestedLoopIndependentSignal(_p, __bfKey) { return createComponent('NestedLoopIndependentSignal', _p, __bfKey) }
